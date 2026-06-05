#!/bin/bash

# Скрипт для установки зависимостей backend (FastAPI) и frontend (web-ui)
# Логи сохраняются в папку log/ с временной меткой в имени файла

set -e  # прерывать выполнение при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Функция для вывода ошибки и выхода
error_exit() {
    echo -e "${RED}[ОШИБКА]${NC} $1" >&2
    exit 1
}

# Создание папки для логов (в корне проекта)
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

# Генерация временной метки для имени файла (например: 2026-06-05_14-30-45)
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# 1. Проверка наличия Python 3
echo "Проверка установки Python 3..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo -e "${GREEN}Найден: $PYTHON_VERSION${NC}"
else
    error_exit "Python 3 не установлен. Пожалуйста, установите Python 3 и повторите попытку."
fi

# 2. Проверка наличия npm
echo "Проверка установки npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}Найден npm версии $NPM_VERSION${NC}"
else
    error_exit "npm не установлен. Пожалуйста, установите npm (обычно вместе с Node.js) и повторите попытку."
fi

# 3. Переход в директорию backend-fastAPI
BACKEND_DIR="backend-fastAPI"
if [ ! -d "$BACKEND_DIR" ]; then
    error_exit "Директория '$BACKEND_DIR' не найдена. Убедитесь, что скрипт запускается из корня проекта."
fi
cd "$BACKEND_DIR"
echo "Перешли в директорию: $(pwd)"

# 4. Создание виртуального окружения, если его нет
VENV_DIR="venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Создание виртуального окружения в $VENV_DIR..."
    python3 -m venv "$VENV_DIR" || error_exit "Не удалось создать виртуальное окружение."
else
    echo "Виртуальное окружение уже существует."
fi

# 5. Установка зависимостей Python (pip + requirements.txt)
REQUIREMENTS_FILE="requirements.txt"
if [ ! -f "$REQUIREMENTS_FILE" ]; then
    error_exit "Файл $REQUIREMENTS_FILE не найден в директории $BACKEND_DIR."
fi

# Имя лога для pip с временной меткой
PIP_LOG="../$LOG_DIR/pip_install_${TIMESTAMP}.log"

echo "Активация виртуального окружения и установка Python-зависимостей (лог: $PIP_LOG)..."
source "$VENV_DIR/bin/activate"

# Обновление pip (лог перезаписывается с новой меткой)
pip install --upgrade pip > "$PIP_LOG" 2>&1 || error_exit "Ошибка при обновлении pip. Смотрите лог: $PIP_LOG"

# Установка зависимостей из requirements.txt
pip install -r "$REQUIREMENTS_FILE" >> "$PIP_LOG" 2>&1 || error_exit "Ошибка при установке зависимостей из requirements.txt. Смотрите лог: $PIP_LOG"

deactivate
echo -e "${GREEN}Python-зависимости успешно установлены (лог сохранён: $PIP_LOG).${NC}"

# 6. Переход в директорию web-ui
cd ..
WEBUI_DIR="web-ui"
if [ ! -d "$WEBUI_DIR" ]; then
    error_exit "Директория '$WEBUI_DIR' не найдена."
fi
cd "$WEBUI_DIR"
echo "Перешли в директорию: $(pwd)"

# 7. Установка npm-зависимостей
NPM_LOG="../$LOG_DIR/npm_install_${TIMESTAMP}.log"

echo "Установка npm-зависимостей (лог: $NPM_LOG)..."
npm install > "$NPM_LOG" 2>&1 || error_exit "Ошибка при выполнении npm install. Смотрите лог: $NPM_LOG"

echo -e "${GREEN}npm-зависимости успешно установлены (лог сохранён: $NPM_LOG).${NC}"

echo -e "${GREEN}Все зависимости успешно установлены.${NC}"