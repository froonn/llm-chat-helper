# ingest.py

import os
import sys
import glob
import logging
import sqlite3
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma

# Импортируем настройки из config.py
import config

# Подавляем технические предупреждения
logging.getLogger("pypdf").setLevel(logging.ERROR)
os.environ["TOKENIZERS_PARALLELISM"] = "false"


def get_all_pdf_files(paths):
    pdf_files = []
    for path in paths:
        if os.path.isdir(path):
            found_files = glob.glob(os.path.join(path, "*.pdf"))
            pdf_files.extend(found_files)
        elif os.path.isfile(path) and path.lower().endswith(".pdf"):
            pdf_files.append(path)
        else:
            expanded = glob.glob(path)
            for f in expanded:
                if os.path.isfile(f) and f.lower().endswith(".pdf"):
                    pdf_files.append(f)
    return sorted(list(set(pdf_files)))


def process_pdfs(input_paths):
    pdf_files = get_all_pdf_files(input_paths)

    if not pdf_files:
        print("[!] PDF-файлы не найдены.")
        return

    print(f"[*] Найдено файлов: {len(pdf_files)}")

    all_documents = []
    print("[*] Чтение документов...")
    for file_path in pdf_files:
        try:
            loader = PyPDFLoader(file_path)
            all_documents.extend(loader.load())
        except Exception:
            pass

    if not all_documents:
        print("[!] Не удалось извлечь текст.")
        return

    print(f"[*] Всего загружено страниц: {len(all_documents)}")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=config.CHUNK_SIZE,
        chunk_overlap=config.CHUNK_OVERLAP
    )
    splits = text_splitter.split_documents(all_documents)
    print(f"[*] Текст разделен на {len(splits)} фрагментов.")

    embeddings = OpenAIEmbeddings(
        openai_api_base=config.BASE_MODEL_URL,
        openai_api_key=config.API_KEY,
        model=config.EMBEDDING_MODEL,
        check_embedding_ctx_length=False
    )

    print(f"[*] Индексация в векторную базу ({config.CHROMA_DB_PATH})...")

    try:
        # Прямая индексация без разбиения на батчи и tqdm
        vectorstore = Chroma.from_documents(
            documents=splits,
            embedding=embeddings,
            persist_directory=config.CHROMA_DB_PATH
        )
        print("[+] Успешно! Векторная база готова к использованию.")
    except Exception as e:
        print(f"[!] Ошибка при индексации: {e}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print("Использование: python ingest.py /путь/к/ресурсам/")
    else:
        process_pdfs(args)