FROM continuumio/miniconda3

# Prevent .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Create conda environment and activate it
RUN conda create -n myapp python=3.11 -y
# Activate environment for all subsequent commands
SHELL ["conda", "run", "-n", "myapp", "/bin/bash", "-c"]

# Upgrade pip
RUN pip install --upgrade pip

# Install WeasyPrint via conda-forge so its system libraries
# (pango, cairo, gdk-pixbuf) come with it — pip alone can't supply those.
RUN conda install -n myapp -c conda-forge weasyprint -y

# Copy and install the remaining python dependencies
COPY ./backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend code (optional if using volumes, but safe)
COPY ./backend /app

# Command to run when container starts
CMD ["conda", "run", "--no-capture-output", "-n", "myapp", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
