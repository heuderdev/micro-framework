# Documentação do AlpineForm servida por nginx na porta 1900.
#
#   docker build -t alpineform-docs .
#   docker run -d --name alpineform-docs -p 1900:1900 --restart unless-stopped alpineform-docs
#
# ou: docker compose up -d --build
#
#   http://localhost:1900/          guia com exemplos (docs/*.html)
#   http://localhost:1900/tecnica   documentação técnica interna (doc.html)

# 1) Gera docs/*.html a partir de docs-src/ (o gerador só usa a biblioteca padrão do Node).
FROM node:22-alpine AS build
WORKDIR /app
COPY scripts/build-docs.mjs scripts/build-docs.mjs
COPY docs-src/ docs-src/
COPY docs/assets/ docs/assets/
RUN node scripts/build-docs.mjs

# 2) Servidor estático.
FROM nginx:1.27-alpine
COPY docker/nginx-docs.conf /etc/nginx/conf.d/default.conf
COPY docker/docs-headers.inc /etc/nginx/conf.d/docs-headers.inc
COPY --from=build /app/docs/ /usr/share/nginx/html/
COPY docs/*.md /usr/share/nginx/html/
COPY doc.html /usr/share/nginx/html/tecnica.html
EXPOSE 1900
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:1900/ || exit 1
