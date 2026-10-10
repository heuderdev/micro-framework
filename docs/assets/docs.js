/*
 * Comportamentos da documentação. Tudo é melhoria progressiva: sem
 * JavaScript, as páginas continuam legíveis e navegáveis.
 *
 * - destaque de sintaxe PHP/JS/HTML/SQL nos blocos de código
 * - botão "Copiar" em cada bloco
 * - índice "Nesta página" montado a partir dos <h2>
 * - âncoras nos títulos
 * - filtro do menu lateral
 * - alternância de tema claro/escuro e menu no celular
 */
(function () {
    'use strict';

    function lerTema() {
        try {
            return localStorage.getItem('alpineform-docs-tema');
        } catch (e) {
            return null;
        }
    }

    function salvarTema(tema) {
        try {
            localStorage.setItem('alpineform-docs-tema', tema);
        } catch (e) {
        }
    }

    var temaSalvo = lerTema();

    if (temaSalvo === 'dark' || temaSalvo === 'light') {
        document.documentElement.setAttribute('data-theme', temaSalvo);
    }

    function escapar(texto) {
        return texto
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    var PALAVRAS_PHP = [
        'abstract', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const',
        'continue', 'default', 'defined', 'die', 'do', 'echo', 'else', 'elseif', 'empty', 'extends',
        'false', 'finally', 'fn', 'for', 'foreach', 'function', 'if', 'implements', 'instanceof',
        'interface', 'isset', 'list', 'namespace', 'new', 'null', 'or', 'and', 'private', 'protected',
        'public', 'require', 'require_once', 'include', 'return', 'self', 'static', 'switch', 'throw',
        'trait', 'true', 'try', 'unset', 'use', 'while', 'parent',
        'let', 'var', 'await', 'async', 'import', 'export', 'from', 'of', 'typeof', 'this', 'undefined', 'delete'
    ];

    var PALAVRAS_SQL = [
        'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'ILIKE', 'INSERT',
        'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'PRIMARY', 'KEY', 'INT',
        'INTEGER', 'VARCHAR', 'DECIMAL', 'NUMERIC', 'DATETIME', 'TIMESTAMP', 'BOOLEAN', 'TINYINT',
        'DEFAULT', 'AUTO_INCREMENT', 'ENGINE', 'GENERATED', 'ALWAYS', 'AS', 'IDENTITY', 'UNIQUE',
        'JSON', 'JSONB', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'FOR', 'BETWEEN',
        'JOIN', 'LEFT', 'INNER', 'ON', 'RETURNING', 'TRUNCATE', 'RESTART', 'BEGIN', 'COMMIT',
        'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'TO', 'START', 'TRANSACTION', 'COUNT', 'SUM', 'DESC',
        'ASC', 'TRUE', 'FALSE', 'TEXT', 'SERIAL', 'BIGINT', 'REFERENCES', 'INDEX'
    ];

    function destacarPhp(codigo) {
        var padrao = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n\[]*$|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\$[A-Za-z_][A-Za-z0-9_]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/gm;
        var palavras = {};

        PALAVRAS_PHP.forEach(function (p) {
            palavras[p] = true;
        });

        var saida = '';
        var ultimo = 0;
        var m;

        while ((m = padrao.exec(codigo)) !== null) {
            var token = m[0];
            saida += escapar(codigo.slice(ultimo, m.index));
            ultimo = m.index + token.length;

            var classe = null;
            var resto = codigo.slice(ultimo);

            if (token.indexOf('/*') === 0 || token.indexOf('//') === 0 || token.charAt(0) === '#') {
                classe = 'tk-c';
            } else if (token.charAt(0) === '\'' || token.charAt(0) === '"') {
                classe = 'tk-s';
            } else if (token.charAt(0) === '$') {
                classe = 'tk-v';
            } else if (/^\d/.test(token)) {
                classe = 'tk-n';
            } else if (palavras[token.toLowerCase()]) {
                classe = 'tk-k';
            } else if (/^\s*::/.test(resto) || /^[A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*$/.test(token) && /^\s*(::|\(|\s+\$|\s*\{|\s+extends|\s+implements)/.test(resto)) {
                classe = 'tk-t';
            } else if (/^\s*\(/.test(resto)) {
                classe = 'tk-f';
            }

            saida += classe
                ? '<span class="' + classe + '">' + escapar(token) + '</span>'
                : escapar(token);
        }

        return saida + escapar(codigo.slice(ultimo));
    }

    function destacarSql(codigo) {
        var padrao = /(--[^\n]*|'(?:''|[^'])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
        var palavras = {};

        PALAVRAS_SQL.forEach(function (p) {
            palavras[p] = true;
        });

        var saida = '';
        var ultimo = 0;
        var m;

        while ((m = padrao.exec(codigo)) !== null) {
            var token = m[0];
            saida += escapar(codigo.slice(ultimo, m.index));
            ultimo = m.index + token.length;

            var classe = null;

            if (token.indexOf('--') === 0) {
                classe = 'tk-c';
            } else if (token.charAt(0) === '\'') {
                classe = 'tk-s';
            } else if (/^\d/.test(token)) {
                classe = 'tk-n';
            } else if (palavras[token.toUpperCase()]) {
                classe = 'tk-k';
            }

            saida += classe
                ? '<span class="' + classe + '">' + escapar(token) + '</span>'
                : escapar(token);
        }

        return saida + escapar(codigo.slice(ultimo));
    }

    // HTML: comentários, tags, atributos e valores (o PHP embutido vira texto).
    function destacarHtml(codigo) {
        var padrao = /(<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*|\/?>|\s[A-Za-z_:@][A-Za-z0-9_:.@-]*(?==)|"[^"]*"|'[^']*')/g;
        var saida = '';
        var ultimo = 0;
        var m;

        while ((m = padrao.exec(codigo)) !== null) {
            var token = m[0];
            saida += escapar(codigo.slice(ultimo, m.index));
            ultimo = m.index + token.length;

            var classe = null;

            if (token.indexOf('<!--') === 0) {
                classe = 'tk-c';
            } else if (token.charAt(0) === '<' || token === '>' || token === '/>') {
                classe = 'tk-k';
            } else if (token.charAt(0) === '"' || token.charAt(0) === '\'') {
                classe = 'tk-s';
            } else {
                classe = 'tk-t';
            }

            saida += '<span class="' + classe + '">' + escapar(token) + '</span>';
        }

        return saida + escapar(codigo.slice(ultimo));
    }

    function prepararBlocos() {
        var blocos = document.querySelectorAll('pre > code');

        Array.prototype.forEach.call(blocos, function (bloco) {
            var original = bloco.textContent;
            var linguagem = bloco.getAttribute('data-lang') || 'php';

            if (linguagem === 'php' || linguagem === 'js') {
                bloco.innerHTML = destacarPhp(original);
            } else if (linguagem === 'html') {
                bloco.innerHTML = destacarHtml(original);
            } else if (linguagem === 'sql') {
                bloco.innerHTML = destacarSql(original);
            }

            var pre = bloco.parentNode;
            var alvo = pre.parentNode.classList.contains('codigo') ? pre.parentNode : pre;
            var botao = document.createElement('button');

            botao.type = 'button';
            botao.className = 'copiar';
            botao.textContent = 'Copiar';
            botao.setAttribute('aria-label', 'Copiar código');

            botao.addEventListener('click', function () {
                var concluir = function () {
                    botao.textContent = 'Copiado!';
                    setTimeout(function () {
                        botao.textContent = 'Copiar';
                    }, 1500);
                };

                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(original).then(concluir, function () {
                        copiarAntigo(original);
                        concluir();
                    });
                } else {
                    copiarAntigo(original);
                    concluir();
                }
            });

            if (alvo !== pre) {
                alvo.appendChild(botao);
                var titulo = alvo.querySelector('.titulo-codigo');

                if (titulo) {
                    botao.style.top = '4px';
                }
            } else {
                pre.appendChild(botao);
            }
        });
    }

    function copiarAntigo(texto) {
        var area = document.createElement('textarea');

        area.value = texto;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();

        try {
            document.execCommand('copy');
        } catch (e) {
        }

        document.body.removeChild(area);
    }

    function prepararAncoras() {
        var titulos = document.querySelectorAll('.conteudo h2[id], .conteudo h3[id]');

        Array.prototype.forEach.call(titulos, function (titulo) {
            var link = document.createElement('a');

            link.href = '#' + titulo.id;
            link.className = 'ancora';
            link.textContent = '#';
            link.setAttribute('aria-label', 'Link para esta seção');
            titulo.appendChild(link);
        });
    }

    function prepararIndice() {
        var destino = document.getElementById('nesta-pagina');

        if (!destino) {
            return;
        }

        var titulos = document.querySelectorAll('.conteudo h2[id]');

        if (titulos.length < 3) {
            destino.parentNode.removeChild(destino);
            return;
        }

        var lista = document.createElement('ol');

        Array.prototype.forEach.call(titulos, function (titulo) {
            var item = document.createElement('li');
            var link = document.createElement('a');

            link.href = '#' + titulo.id;
            link.textContent = titulo.getAttribute('data-titulo') || titulo.textContent;
            item.appendChild(link);
            lista.appendChild(item);
        });

        var rotulo = document.createElement('strong');
        rotulo.textContent = 'Nesta página';

        destino.appendChild(rotulo);
        destino.appendChild(lista);
        destino.className = 'nesta-pagina';
    }

    function prepararFiltroMenu() {
        var campo = document.getElementById('filtro-menu');

        if (!campo) {
            return;
        }

        var links = document.querySelectorAll('.nav a');
        var grupos = document.querySelectorAll('.nav .grupo');
        var vazio = document.querySelector('.nav .vazio');

        campo.addEventListener('input', function () {
            var termo = campo.value.trim().toLowerCase();
            var visiveis = 0;

            Array.prototype.forEach.call(links, function (link) {
                var texto = (link.textContent + ' ' + (link.getAttribute('data-busca') || '')).toLowerCase();
                var mostrar = termo === '' || texto.indexOf(termo) !== -1;

                link.style.display = mostrar ? '' : 'none';

                if (mostrar) {
                    visiveis++;
                }
            });

            Array.prototype.forEach.call(grupos, function (grupo) {
                grupo.style.display = termo === '' ? '' : 'none';
            });

            if (vazio) {
                vazio.style.display = visiveis === 0 ? 'block' : 'none';
            }
        });
    }

    function prepararBotoes() {
        var tema = document.getElementById('alternar-tema');
        var menu = document.getElementById('alternar-menu');

        if (tema) {
            tema.addEventListener('click', function () {
                var atual = document.documentElement.getAttribute('data-theme');

                if (!atual) {
                    atual = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                        ? 'dark'
                        : 'light';
                }

                var novo = atual === 'dark' ? 'light' : 'dark';

                document.documentElement.setAttribute('data-theme', novo);
                salvarTema(novo);
            });
        }

        if (menu) {
            menu.addEventListener('click', function () {
                document.body.classList.toggle('menu-aberto');
            });
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        prepararIndice();
        prepararBlocos();
        prepararAncoras();
        prepararFiltroMenu();
        prepararBotoes();
    });
})();
