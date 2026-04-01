FROM python:3.11-slim-bookworm

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
    PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn \
    PIP_DEFAULT_TIMEOUT=1200 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN printf '%s\n' \
    'deb https://mirrors.tuna.tsinghua.edu.cn/debian bookworm main' \
    'deb https://mirrors.tuna.tsinghua.edu.cn/debian bookworm-updates main' \
    'deb https://mirrors.tuna.tsinghua.edu.cn/debian-security bookworm-security main' \
    > /etc/apt/sources.list \
 && rm -f /etc/apt/sources.list.d/debian.sources \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
