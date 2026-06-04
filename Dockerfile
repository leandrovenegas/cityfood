FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Ensure Playwright Chromium is installed correctly
RUN playwright install chromium

# Copy project files
COPY . .

# Default command (can be overridden in docker-compose)
CMD ["python", "spider.py"]
