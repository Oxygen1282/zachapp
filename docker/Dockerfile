FROM continuumio/miniconda3

# Prevent .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app 

# WeasyPrint's native dependencies at the OS level (apt). These land in
# /usr/lib, which the dynamic linker ALWAYS searches — no LD_LIBRARY_PATH, no
# conda-run env quirks. libglib2.0-0 provides libgobject-2.0-0.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libcairo2 \
    libffi-dev \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

RUN conda create -n myapp python=3.11 -y
SHELL ["conda", "run", "-n", "myapp", "/bin/bash", "-c"]

RUN pip install --upgrade pip 

# weasyprint now comes from pip (in requirements.txt); the apt libs above
# satisfy its native deps. Remove weasyprint from conda entirely.
COPY ./backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt 

COPY ./backend /app

CMD ["conda", "run", "--no-capture-output", "-n", "myapp", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# # Make the conda env's shared libraries findable by the dynamic linker.
# # WeasyPrint dlopen()s libgobject/pango/cairo BY NAME; the files ARE installed
# # in the env's lib dir, but without it on LD_LIBRARY_PATH the linker never looks
# # there and dlopen fails. This exposes them.
# ENV LD_LIBRARY_PATH=/opt/conda/envs/myapp/lib

# # Set working directory
# WORKDIR /app

# # Create conda environment and activate it
# RUN conda create -n myapp python=3.11 -y
# # Activate environment for all subsequent commands
# SHELL ["conda", "run", "-n", "myapp", "/bin/bash", "-c"]

# # Upgrade pip
# RUN pip install --upgrade pip

# # Install WeasyPrint via conda-forge so its system libraries
# # (pango, cairo, gdk-pixbuf) come with it — pip alone can't supply those.
# RUN conda install -n myapp -c conda-forge weasyprint -y

# # Copy and install the remaining python dependencies
# COPY ./backend/requirements.txt /app/requirements.txt
# RUN pip install --no-cache-dir -r requirements.txt

# # Copy the backend code (optional if using volumes, but safe)
# COPY ./backend /app

# # Command to run when container starts
# CMD ["conda", "run", "--no-capture-output", "-n", "myapp", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
