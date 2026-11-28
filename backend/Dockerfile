# The official Linux app contains both x86_64 and ARM64 JNI libraries.
# Use the Java app with a native JRE, not the bundled x86_64 launcher/runtime.
FROM python:3.14.8-slim@sha256:fbecd461fc72d21b2143c6eaba25143738079154a6d0ea3da3aec724f50eed4a AS recognition-assets
ARG AUDIVERIS_VERSION=5.11.0
ARG AUDIVERIS_SHA256=f20113aaa33b3149ec8d6a09b2a7963360e65fafd92d69389987a85bbc3ec7a3
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL --retry 3 \
      "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb" \
      -o /tmp/audiveris.deb \
    && echo "${AUDIVERIS_SHA256}  /tmp/audiveris.deb" | sha256sum -c - \
    && dpkg-deb -x /tmp/audiveris.deb /tmp/package \
    && mkdir -p /opt/audiveris \
    && cp -a /tmp/package/opt/audiveris/lib/app /opt/audiveris/app \
    && curl -fsSL --retry 3 \
      "https://raw.githubusercontent.com/Audiveris/audiveris/${AUDIVERIS_VERSION}/LICENSE" \
      -o /opt/audiveris/LICENSE \
    && rm -rf /tmp/package /tmp/audiveris.deb
# Same tessdata 4.1.0 models as local tests, not the smaller fast models.
RUN mkdir -p /opt/tessdata \
    && curl -fsSL --retry 3 https://raw.githubusercontent.com/tesseract-ocr/tessdata/4.1.0/eng.traineddata \
      -o /opt/tessdata/eng.traineddata \
    && curl -fsSL --retry 3 https://raw.githubusercontent.com/tesseract-ocr/tessdata/4.1.0/jpn.traineddata \
      -o /opt/tessdata/jpn.traineddata \
    && echo "daa0c97d651c19fba3b25e81317cd697e9908c8208090c94c3905381c23fc047  /opt/tessdata/eng.traineddata" | sha256sum -c - \
    && echo "6f416b902d129d8cc28e99c33244034b1cf52549e8560f6320b06d317852159a  /opt/tessdata/jpn.traineddata" | sha256sum -c - \
    && curl -fsSL --retry 3 https://raw.githubusercontent.com/tesseract-ocr/tessdata/4.1.0/LICENSE \
      -o /opt/tessdata/LICENSE

FROM eclipse-temurin:25-jre-noble@sha256:f3dd0838e69b881cc382237d5901e74ae3705b1056ad964b2e0e523b174fef99 AS java-runtime

FROM python:3.14.8-slim@sha256:fbecd461fc72d21b2143c6eaba25143738079154a6d0ea3da3aec724f50eed4a
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      libfreetype6 libfontconfig1 libstdc++6 libgomp1 \
      fonts-dejavu-core fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
COPY --from=java-runtime /opt/java/openjdk /opt/java/openjdk
COPY --from=recognition-assets /opt/audiveris /opt/audiveris
COPY --from=recognition-assets /opt/tessdata /opt/tessdata
COPY --chmod=755 docker/audiveris.sh /usr/local/bin/audiveris
ENV JAVA_HOME=/opt/java/openjdk \
    PATH="/opt/java/openjdk/bin:${PATH}" \
    AUDIVERIS_BIN=/usr/local/bin/audiveris \
    AUDIVERIS_HEAP=2g \
    TESSDATA_PREFIX=/opt/tessdata
RUN java -version && audiveris -help >/dev/null
COPY . ./
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
