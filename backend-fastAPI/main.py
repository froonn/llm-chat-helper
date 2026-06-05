# main.py

import asyncio
import uuid
import sqlite3
import uvicorn
from contextlib import asynccontextmanager
from typing import List, Dict, Optional

from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma

import config

# --- Инициализация компонентов ---

client = AsyncOpenAI(
    base_url=config.BASE_MODEL_URL,
    api_key=config.API_KEY
)

# Важно: инициализируем embeddings ровно так же, как в ingest.py
embeddings = OpenAIEmbeddings(
    openai_api_base=config.BASE_MODEL_URL,
    openai_api_key=config.API_KEY,
    model=config.EMBEDDING_MODEL,
    check_embedding_ctx_length=False
)

# Глобальная переменная для векторного хранилища
vector_db: Optional[Chroma] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управление жизненным циклом: выполняется при старте и остановке"""
    global vector_db
    # Инициализация векторной БД
    vector_db = Chroma(
        persist_directory=config.CHROMA_DB_PATH,
        embedding_function=embeddings
    )
    # Проверка/инициализация SQLite
    with sqlite3.connect(config.SQLITE_DB_PATH) as conn:
        conn.execute("""
                     CREATE TABLE IF NOT EXISTS messages
                     (
                         id        INTEGER PRIMARY KEY AUTOINCREMENT,
                         chat_id   TEXT,
                         role      TEXT,
                         content   TEXT,
                         timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                     )
                     """)
    yield
    # Здесь можно закрыть соединения, если нужно


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Модели данных ---

class ChatRequest(BaseModel):
    message: str
    chat_id: Optional[str] = None


# --- Вспомогательные функции ---

def get_chat_history(chat_id: str) -> List[Dict]:
    """Извлекает историю с учетом лимита из конфига"""
    with sqlite3.connect(config.SQLITE_DB_PATH) as conn:
        cursor = conn.cursor()

        query = "SELECT role, content FROM messages WHERE chat_id = ? ORDER BY timestamp DESC"
        params = [chat_id]

        if config.HISTORY_LIMIT != -1:
            query += " LIMIT ?"
            params.append(config.HISTORY_LIMIT * 2)  # умножаем на 2, т.к. пара user+assistant

        cursor.execute(query, params)
        return [{"role": r, "content": c} for r, c in reversed(cursor.fetchall())]


def save_to_db(chat_id: str, role: str, content: str):
    with sqlite3.connect(config.SQLITE_DB_PATH) as conn:
        conn.execute("INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
                     (chat_id, role, content))


# --- Генераторы ответов ---

async def rag_llm_generator(user_message: str, chat_id: str):
    """Генерация через локальную LLM + RAG"""
    yield f'{{"chat_id": "{chat_id}"}}\n'
    save_to_db(chat_id, "user", user_message)

    # 1. Поиск контекста (Retrieval)
    docs = vector_db.similarity_search(user_message, k=config.TOP_K_DOCUMENTS)
    context = "\n".join([d.page_content for d in docs])

    # 2. История (Memory)
    history = get_chat_history(chat_id)

    # 3. Промпт
    messages = [{"role": "system", "content": f"{config.SYSTEM_PROMPT}\nКонтекст: {context}"}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    # 4. Стриминг (Generation)
    full_response = ""
    try:
        stream = await client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=messages,
            stream=True
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_response += content
                yield content
    except Exception as e:
        yield f"\n[Ошибка LLM]: {str(e)}"

    save_to_db(chat_id, "assistant", full_response)


async def template_generator(user_message: str, chat_id: str):
    """Простой шаблонный ответ"""
    yield f'{{"chat_id": "{chat_id}"}}\n'
    save_to_db(chat_id, "user", user_message)

    await asyncio.sleep(0.5)
    response_text = f"Шаблонный ответ на запрос: '{user_message}'. Режим LLM выключен в конфиге."

    for word in response_text.split():
        yield f"{word} "
        await asyncio.sleep(0.05)

    save_to_db(chat_id, "assistant", response_text)


# --- Эндпоинты ---

@app.post("/api/v1/chat/stream")
async def chat_stream(request: ChatRequest):
    cid = request.chat_id or str(uuid.uuid4())

    # Выбор режима генерации на основе конфига
    if config.RESPONSE_MODE == "llm":
        generator = rag_llm_generator(request.message, cid)
    else:
        generator = template_generator(request.message, cid)

    return StreamingResponse(generator, media_type="text/plain")


@app.get("/api/v1/chat/history/{chat_id}")
async def get_history_endpoint(chat_id: str):
    history = get_chat_history(chat_id)
    if not history and chat_id != "new":
        raise HTTPException(status_code=404, detail="История не найдена")
    return {"chat_id": chat_id, "history": history}


@app.delete("/api/v1/chat/history/{chat_id}")
async def delete_history(chat_id: str):
    with sqlite3.connect(config.SQLITE_DB_PATH) as conn:
        conn.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
    return {"status": "success", "message": f"История {chat_id} удалена"}


if __name__ == "__main__":
    # Запуск с флагом reload для разработки
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)