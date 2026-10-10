<?php

declare(strict_types=1);

namespace AlpineForm\Server;

use AlpineForm\Helpers\Consulta;

/**
 * Endpoints de REFERÊNCIA usados pelos exemplos e testes E2E.
 * Contrato de resposta: { success, message, errors: {campo: [..]}, data, request_id }.
 * Cada handler retorna [status, corpo|null, cabeçalhos].
 */
final class Api
{
    private string $storage;
    private string $requestId;

    /** @param array<string, mixed> $config */
    public function __construct(private array $config)
    {
        $this->storage = $config['storage'];
        $this->requestId = Fs::randomId(8);
    }

    public function requestId(): string
    {
        return $this->requestId;
    }

    private function chunks(): ChunkStore
    {
        return new ChunkStore($this->storage, $this->config['chunks']);
    }

    private function jobs(): JobQueue
    {
        return new JobQueue($this->storage);
    }

    /** @return array{0: int, 1: array<string, mixed>|null, 2: array<string, string>} */
    private function ok(array $data = [], string $message = 'Operação concluída.', int $status = 200): array
    {
        return [$status, ['success' => true, 'message' => $message, 'errors' => new \stdClass(), 'data' => $data, 'request_id' => $this->requestId], []];
    }

    /** @param array<string, list<string>> $errors @return array{0: int, 1: array<string, mixed>, 2: array<string, string>} */
    private function invalid(array $errors, string $message = 'Confira os campos destacados.', int $status = 422): array
    {
        return [$status, ['success' => false, 'message' => $message, 'errors' => $errors ?: new \stdClass(), 'data' => null, 'request_id' => $this->requestId], []];
    }

    /** @return array{0: int, 1: array<string, mixed>|null, 2: array<string, string>} */
    public function handle(Request $request): array
    {
        $method = $request->method;
        $path = rtrim($request->path, '/') ?: '/';
        if ($method === 'GET' && $path === '/api/csrf') {
            return [200, ['token' => Session::csrf()], []];
        }
        $owner = Session::owner();
        if (!in_array($method, ['GET', 'HEAD'], true)) {
            Session::verifyCsrf($request);
        }
        Session::release();

        $routes = [
            ['POST', '#^/api/cadastro$#', fn () => $this->cadastro($request, $owner)],
            ['POST', '#^/api/validar-email$#', fn () => $this->validarEmail($request)],
            ['POST', '#^/api/upload$#', fn () => $this->upload($request, $owner)],
            ['POST', '#^/api/perfil$#', fn () => $this->perfil($request, $owner)],
            ['POST', '#^/api/pedido$#', fn () => $this->pedido($request)],
            ['POST', '#^/api/pagamento$#', fn () => $this->pagamento($request)],
            ['POST', '#^/api/preferencias$#', fn () => $this->preferencias($request)],
            ['POST', '#^/api/documentos$#', fn () => $this->documentos($request, $owner)],
            ['POST', '#^/api/importacoes$#', fn () => $this->importacao($request, $owner)],
            ['GET', '#^/api/jobs/([a-f0-9]{32})$#', fn ($m) => [200, JobQueue::publicView($this->jobs()->get($owner, $m[1])), []]],
            ['DELETE', '#^/api/jobs/([a-f0-9]{32})$#', fn ($m) => [202, JobQueue::publicView($this->jobs()->requestCancel($owner, $m[1])), []]],
            ['POST', '#^/api/uploads$#', fn () => [201, $this->chunks()->create($owner, $request->json()), []]],
            ['GET', '#^/api/uploads/([a-f0-9]{32})$#', fn ($m) => [200, $this->chunks()->status($owner, $m[1]), []]],
            ['DELETE', '#^/api/uploads/([a-f0-9]{32})$#', function ($m) use ($owner) {
                $this->chunks()->cancel($owner, $m[1]);
                return [204, null, []];
            }],
            ['PUT', '#^/api/uploads/([a-f0-9]{32})/parts/(\d{1,5})$#', fn ($m) => $this->putPart($request, $owner, $m[1], (int) $m[2])],
            ['POST', '#^/api/uploads/([a-f0-9]{32})/complete$#', function ($m) use ($request, $owner) {
                $body = $request->json();
                $manifest = is_string($body['manifest'] ?? null) ? $body['manifest'] : null;
                return [200, $this->chunks()->complete($owner, $m[1], $manifest), []];
            }],
            ['GET', '#^/api/demo/(cep|cnpj)/([0-9]{1,14})$#', fn ($m) => self::consultaDemo($m[1], $m[2], $request->query)],
            ['ANY', '#^/api/demo/([a-z0-9-]+)$#', fn ($m) => $this->demo($m[1], $request)],
        ];
        foreach ($routes as [$verb, $pattern, $handler]) {
            if (preg_match($pattern, $path, $matches) === 1) {
                if ($verb !== 'ANY' && $verb !== $method) {
                    continue;
                }
                return $handler($matches);
            }
        }
        throw new HttpError(404, 'Rota não encontrada.');
    }

    private function cadastro(Request $request, string $owner): array
    {
        $data = $request->data();
        $key = $request->header('idempotency-key');
        $idem = new Idempotency($this->storage, $this->config['idempotency_ttl']);
        $fingerprint = hash('sha256', json_encode($data));
        if ($key !== null) {
            $begin = $idem->begin($owner, 'cadastro', $key, $fingerprint);
            if ($begin['replay']) {
                return [200, $begin['response'] + ['replayed' => true], ['Idempotent-Replayed' => 'true']];
            }
        }
        $v = new Validator($data);
        if ($v->required('nome', 'Informe seu nome.')) {
            $v->length('nome', 3, 120, 'O nome deve ter entre 3 e 120 caracteres.');
        }
        if ($v->required('email', 'Informe seu e-mail.')) {
            $v->email('email', 'E-mail inválido.');
            if (in_array(strtolower((string) $v->value('email')), $this->config['demo']['taken_emails'], true)) {
                $v->add('email', 'Este e-mail já está cadastrado.');
            }
        }
        if ($v->filled('cpf')) {
            $v->cpf('cpf', 'CPF inválido.');
        }
        if ($v->filled('senha')) {
            $v->length('senha', 8, 200, 'A senha deve ter ao menos 8 caracteres.');
            $v->same('senha_confirmacao', 'senha', 'A confirmação não confere.');
        }
        if (($data['tipo'] ?? '') === 'pj') {
            $v->required('cnpj', 'Informe o CNPJ.');
            $v->cnpj('cnpj', 'CNPJ inválido.');
        }
        if (($data['nome'] ?? '') === 'erro geral') {
            $v->add('_general', 'Cadastro temporariamente bloqueado para este nome (erro geral de demonstração).');
        }
        if ($v->fails()) {
            $errors = $v->errors();
            $general = $errors['_general'] ?? [];
            unset($errors['_general']);
            if ($key !== null) {
                $idem->abort($owner, 'cadastro', $key);
            }
            $response = $this->invalid($errors);
            if ($general) {
                $response[1]['errors'] = $errors + ['_general' => $general];
            }
            return $response;
        }
        $id = Fs::randomId(8);
        Fs::writeJsonAtomic($this->storage . '/records/cadastro-' . $id . '.json', ['id' => $id, 'owner' => $owner, 'nome' => $data['nome'], 'email' => $data['email'], 'createdAt' => time()]);
        $response = ['success' => true, 'message' => 'Cadastro realizado com sucesso.', 'errors' => new \stdClass(), 'data' => ['id' => $id], 'request_id' => $this->requestId];
        if ($key !== null) {
            $idem->complete($owner, 'cadastro', $key, $response);
        }
        return [201, $response, []];
    }

    private function validarEmail(Request $request): array
    {
        $delay = (int) $this->config['demo']['remote_delay_ms'];
        if ($delay > 0) {
            usleep($delay * 1000);
        }
        if (($request->query['falhar'] ?? '') === '1') {
            throw new HttpError(503, 'Serviço de verificação indisponível (demonstração).');
        }
        $email = strtolower(trim((string) ($request->post['email'] ?? '')));
        $currentId = (string) ($request->post['id'] ?? '');
        if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return [200, ['valid' => false, 'message' => 'E-mail inválido.'], []];
        }
        $taken = in_array($email, $this->config['demo']['taken_emails'], true);
        if ($taken && $currentId === '7' && $email === 'joao@exemplo.com') {
            $taken = false;
        }
        return [200, ['valid' => !$taken, 'message' => $taken ? 'Este e-mail já está cadastrado.' : null], []];
    }

    /** @return list<array<string, mixed>> */
    private function storeUploads(Request $request, string $field, array &$errors, int $maxFiles): array
    {
        $entry = $request->files[$field] ?? null;
        $files = is_array($entry) ? UploadInspector::normalize($entry) : [];
        if (count($files) > $maxFiles) {
            $errors[$field][] = "Envie no máximo {$maxFiles} arquivo(s).";
            return [];
        }
        $inspector = new UploadInspector($this->config['upload']['allowed'], $this->config['upload']['max_file_bytes']);
        $stored = [];
        foreach ($files as $i => $file) {
            $result = $inspector->inspect($file);
            if (!$result['ok']) {
                $errors[$field . '.' . $i][] = $result['error'];
                continue;
            }
            $storedName = Fs::randomId(16) . '.' . $result['ext'];
            Fs::ensureDir($this->storage . '/files');
            if (!move_uploaded_file($file['tmp_name'], $this->storage . '/files/' . $storedName)) {
                $errors[$field . '.' . $i][] = 'Falha ao armazenar o arquivo.';
                continue;
            }
            $stored[] = ['name' => $result['name'], 'size' => $result['size'], 'mime' => $result['mime'], 'stored' => $storedName] + (isset($result['width']) ? ['width' => $result['width'], 'height' => $result['height']] : []);
        }
        return $stored;
    }

    private function upload(Request $request, string $owner): array
    {
        $errors = [];
        $titulo = trim((string) ($request->post['titulo'] ?? ''));
        if (array_key_exists('titulo', $request->post) && $titulo === '') {
            $errors['titulo'][] = 'Informe um título.';
        }
        $result = [];
        foreach (array_keys($request->files) as $field) {
            $result[$field] = $this->storeUploads($request, (string) $field, $errors, $this->config['upload']['max_files']);
        }
        if (!$request->files && ($request->query['exigir'] ?? '') === '1') {
            $errors['documentos'][] = 'Envie ao menos um arquivo.';
        }
        if ($errors) {
            return $this->invalid($errors);
        }
        return $this->ok(['arquivos' => $result, 'owner' => substr($owner, 0, 6)], 'Arquivos recebidos.');
    }

    /** Edição com arquivos existentes: aplica remoções pedidas e recebe novos arquivos. */
    private function perfil(Request $request, string $owner): array
    {
        $existing = Session::get('perfil_anexos', [['id' => '101', 'name' => 'contrato.pdf'], ['id' => '102', 'name' => 'rg-frente.jpg']]);
        $remove = array_map('strval', (array) ($request->post['anexos_remover'] ?? []));
        $known = array_column($existing, 'id');
        $errors = [];
        foreach ($remove as $id) {
            if (!in_array($id, $known, true)) {
                $errors['anexos'][] = "Anexo {$id} não pertence a este perfil.";
            }
        }
        $kept = array_values(array_filter($existing, static fn ($e) => !in_array($e['id'], $remove, true)));
        $new = $this->storeUploads($request, 'anexos', $errors, 5);
        if (count($kept) + count($new) === 0) {
            $errors['anexos'][] = 'O perfil precisa de ao menos um anexo.';
        }
        if ($errors) {
            return $this->invalid($errors);
        }
        foreach ($new as $file) {
            $kept[] = ['id' => (string) random_int(1000, 9999), 'name' => $file['name']];
        }
        Session::set('perfil_anexos', $kept);
        return $this->ok(['anexos' => $kept, 'removidos' => $remove], 'Perfil atualizado.');
    }

    private function pedido(Request $request): array
    {
        $data = $request->data();
        $itens = is_array($data['itens'] ?? null) ? $data['itens'] : [];
        $errors = [];
        if (!$itens) {
            $errors['itens'][] = 'Adicione ao menos um item.';
        }
        foreach ($itens as $i => $item) {
            $produto = trim((string) ($item['produto'] ?? ''));
            $qtd = (string) ($item['quantidade'] ?? '');
            if ($produto === '') {
                $errors["itens.{$i}.produto"][] = 'Informe o produto.';
            } elseif (stripos($produto, 'esgotado') !== false) {
                $errors["itens.{$i}.produto"][] = 'Produto esgotado (validação do servidor).';
            }
            if (preg_match('/^[1-9]\d*$/', $qtd) !== 1) {
                $errors["itens.{$i}.quantidade"][] = 'Quantidade inválida.';
            }
        }
        if ($errors) {
            return $this->invalid($errors);
        }
        return $this->ok(['itens' => count($itens)], 'Pedido registrado.');
    }

    private function pagamento(Request $request): array
    {
        $data = $request->data();
        $v = new Validator($data);
        $doc = (string) ($data['documento'] ?? '');
        if ($v->required('documento', 'Informe CPF ou CNPJ.') && !Validator::isCpf($doc) && !Validator::isCnpj($doc)) {
            $v->add('documento', 'CPF/CNPJ inválido.');
        }
        $v->required('valor', 'Informe o valor.');
        $v->decimal('valor', '0.01', 'Valor deve ser um decimal canônico maior ou igual a 0.01.');
        if ($v->fails()) {
            return $this->invalid($v->errors());
        }
        return $this->ok(['recebido' => array_intersect_key($data, array_flip(['documento', 'telefone', 'cep', 'valor', 'codigo', 'percentual', 'data']))], 'Dados recebidos pelo servidor.');
    }

    private function preferencias(Request $request): array
    {
        $data = $request->data();
        $v = new Validator($data);
        $v->required('plano', 'Escolha um plano.');
        $v->in('plano', ['basico', 'pro', 'empresa'], 'Plano inválido.');
        $v->in('interesses', ['php', 'js', 'devops', 'dados'], 'Interesse inválido.');
        $v->in('estados', ['SP', 'RJ', 'MG', 'RS', 'BA'], 'Estado inválido.');
        if ($v->fails()) {
            return $this->invalid($v->errors());
        }
        return $this->ok(['recebido' => $data], 'Preferências salvas.');
    }

    /** Vincula tokens de upload em partes ao registro (upload != vínculo != commit). */
    private function documentos(Request $request, string $owner): array
    {
        $data = $request->data();
        $errors = [];
        $titulo = trim((string) ($data['titulo'] ?? ''));
        if ($titulo === '') {
            $errors['titulo'][] = 'Informe um título.';
        }
        $tokens = array_values(array_filter((array) ($data['arquivo'] ?? []), static fn ($t) => is_string($t) && $t !== ''));
        if (!$tokens) {
            $errors['arquivo'][] = 'Envie o arquivo.';
        }
        if ($errors) {
            return $this->invalid($errors);
        }
        $store = $this->chunks();
        $bound = [];
        foreach ($tokens as $i => $token) {
            try {
                $bound[] = $store->bind($owner, $token, $this->storage . '/files');
            } catch (HttpError $error) {
                $errors['arquivo.' . $i][] = $error->getMessage();
            }
        }
        if ($errors) {
            return $this->invalid($errors);
        }
        $id = Fs::randomId(8);
        Fs::writeJsonAtomic($this->storage . '/records/documento-' . $id . '.json', ['id' => $id, 'owner' => $owner, 'titulo' => $titulo, 'arquivos' => array_map(static fn ($b) => ['name' => $b['name'], 'size' => $b['size'], 'stored' => $b['stored']], $bound), 'createdAt' => time()]);
        return $this->ok(['id' => $id, 'arquivos' => array_map(static fn ($b) => ['name' => $b['name'], 'size' => $b['size']], $bound)], 'Documento registrado.');
    }

    /** Recebe CSV (multipart ou token de chunks) e enfileira processamento: HTTP 202 + job. */
    private function importacao(Request $request, string $owner): array
    {
        $errors = [];
        $path = null;
        $name = null;
        $token = $request->post['planilha'] ?? null;
        if (is_string($token) && $token !== '') {
            try {
                $bound = $this->chunks()->bind($owner, $token, $this->storage . '/imports');
                $path = $bound['path'];
                $name = $bound['name'];
            } catch (HttpError $error) {
                $errors['planilha'][] = $error->getMessage();
            }
        } else {
            $stored = $this->storeUploads($request, 'planilha', $errors, 1);
            if ($stored) {
                Fs::ensureDir($this->storage . '/imports');
                $path = $this->storage . '/imports/' . $stored[0]['stored'];
                rename($this->storage . '/files/' . $stored[0]['stored'], $path);
                $name = $stored[0]['name'];
            } elseif (!$errors) {
                $errors['planilha'][] = 'Envie a planilha CSV.';
            }
        }
        if ($errors) {
            return $this->invalid($errors);
        }
        $delay = max(0, min(5000, (int) ($request->post['atraso_ms'] ?? 300)));
        $job = $this->jobs()->create($owner, 'import_csv', ['path' => $path, 'name' => $name, 'delayMs' => $delay]);
        return [202, [
            'success' => true,
            'message' => 'Arquivo recebido. Processamento enfileirado.',
            'job' => ['id' => $job['id'], 'status_url' => '/api/jobs/' . $job['id'], 'cancel_url' => '/api/jobs/' . $job['id']],
            'request_id' => $this->requestId,
        ], []];
    }

    private function putPart(Request $request, string $owner, string $id, int $index): array
    {
        $offset = $request->header('x-chunk-offset');
        $size = $request->header('x-chunk-size');
        if ($offset === null || $size === null || !ctype_digit($offset) || !ctype_digit($size)) {
            throw new HttpError(422, 'Cabeçalhos X-Chunk-Offset e X-Chunk-Size são obrigatórios.');
        }
        $failRate = (int) ($request->query['falhar'] ?? 0);
        if ($failRate > 0 && random_int(1, 100) <= $failRate) {
            throw new HttpError(503, 'Falha transitória simulada.', [], ['Retry-After' => '0']);
        }
        $stream = fopen('php://input', 'rb');
        try {
            return [200, $this->chunks()->putPart($owner, $id, $index, (int) $offset, (int) $size, $request->header('x-chunk-sha256'), $stream), []];
        } finally {
            fclose($stream);
        }
    }

    /** Cenários de resposta para testar o cliente (HTTP x sucesso lógico, HTML, 204, timeouts...). */
    /**
     * Listagem de demonstração (137 clientes fictícios, determinísticos) no formato Laravel API Resource:
     * { data: [...], meta: { current_page, last_page, per_page, total } }.
     * Filtros: busca (nome/e-mail), uf, status[] (lista); ordenação só por colunas permitidas.
     * ?ms=… atrasa a resposta (para ver o estado "carregando"); ?falhar=1 responde 500.
     *
     * @param array<string, mixed> $query
     * @return array<string, mixed>
     */
    public static function listarClientes(array $query, array $extras = [], array $ajustes = []): array
    {
        if (($query['falhar'] ?? '') === '1') {
            throw new HttpError(500, 'Falha simulada ao listar clientes.');
        }
        usleep(max(0, min(5000, (int) ($query['ms'] ?? 0))) * 1000);
        $nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nícolas', 'Olívia', 'Paulo', 'Quésia'];
        $sobrenomes = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Costa', 'Pereira', 'Almeida'];
        $ufs = ['SP', 'RJ', 'MG', 'RS', 'BA', 'PR'];
        $status = ['ativo', 'inativo', 'pendente'];
        $clientes = [];
        for ($i = 1; $i <= 137; $i++) {
            $nome = $nomes[$i % count($nomes)] . ' ' . $sobrenomes[($i * 7) % count($sobrenomes)];
            $clientes[] = [
                'id' => $i,
                'nome' => $nome,
                'email' => strtolower(str_replace(['á', 'é', 'í', 'ó', 'ú', ' '], ['a', 'e', 'i', 'o', 'u', '.'], $nome)) . $i . '@exemplo.com',
                'uf' => $ufs[($i * 5) % count($ufs)],
                'status' => $status[($i + intdiv($i, 5)) % count($status)],
                'saldo' => number_format((($i * 7919) % 100000) / 100, 2, '.', ''),
                'criado_em' => date('Y-m-d', 1735700000 + $i * 86400 * 2),
            ];
        }
        foreach ($extras as $extra) {
            if (is_array($extra) && isset($extra['id'], $extra['nome'])) {
                $clientes[] = $extra;
            }
        }
        // edições e exclusões feitas na demonstração de CRUD (guardadas na sessão)
        $editados = (array) ($ajustes['editados'] ?? []);
        $excluidos = array_map('intval', (array) ($ajustes['excluidos'] ?? []));
        $clientes = array_values(array_filter($clientes, static fn (array $c): bool => !in_array((int) $c['id'], $excluidos, true)));
        foreach ($clientes as $i => $c) {
            if (isset($editados[$c['id']]) && is_array($editados[$c['id']])) {
                $clientes[$i] = array_merge($c, array_intersect_key($editados[$c['id']], array_flip(['nome', 'email', 'uf', 'cidade'])));
            }
        }
        // parâmetros lidos pelos helpers PHP (php/alpine-form.php): lista branca de ordenação, limites e filtros tipados
        $consulta = Consulta::ler($query, ['ordenaveis' => ['id', 'nome', 'uf', 'status', 'saldo', 'criado_em'], 'ordem' => 'id']);
        $busca = mb_strtolower((string) $consulta->texto('busca'));
        if ($busca !== '') {
            $clientes = array_values(array_filter($clientes, static fn (array $c): bool => str_contains(mb_strtolower($c['nome']), $busca) || str_contains($c['email'], $busca)));
        }
        $uf = $consulta->opcao('uf', $ufs);
        if ($uf !== null) {
            $clientes = array_values(array_filter($clientes, static fn (array $c): bool => $c['uf'] === $uf));
        }
        $statusFiltro = $consulta->opcoes('status', $status);
        if ($statusFiltro) {
            $clientes = array_values(array_filter($clientes, static fn (array $c): bool => in_array($c['status'], $statusFiltro, true)));
        }
        return $consulta->paginarArray($consulta->ordenarArray($clientes));
    }

    /**
     * Opções para selects dependentes (módulo alpine-form-opcoes): UFs (mapa sigla => nome), cidades por UF
     * ({ data: [{ id, nome, regiao }] }) e bairros por cidade (lista de textos). ?ms=… atrasa; ?falhar=1 → 500.
     *
     * @param array<string, mixed> $query
     * @return array<mixed>
     */
    public static function opcoesDemo(string $tipo, array $query): array
    {
        if (($query['falhar'] ?? '') === '1') {
            throw new HttpError(500, 'Falha simulada ao carregar opções.');
        }
        usleep(max(0, min(5000, (int) ($query['ms'] ?? 0))) * 1000);
        $cidades = [
            'SP' => [[3550308, 'São Paulo', 'Capital'], [3509502, 'Campinas', 'Interior'], [3548500, 'Santos', 'Litoral'], [3543402, 'Ribeirão Preto', 'Interior']],
            'RJ' => [[3304557, 'Rio de Janeiro', 'Capital'], [3303302, 'Niterói', 'Metropolitana'], [3301702, 'Duque de Caxias', 'Metropolitana']],
            'MG' => [[3106200, 'Belo Horizonte', 'Capital'], [3170206, 'Uberlândia', 'Interior']],
            'AC' => [],
        ];
        $bairros = [
            3550308 => ['Sé', 'Mooca', 'Pinheiros', 'Vila Mariana'],
            3509502 => ['Cambuí', 'Barão Geraldo'],
            3304557 => ['Centro', 'Copacabana', 'Tijuca'],
            3303302 => ['Icaraí', 'Ingá'],
            3106200 => ['Savassi', 'Pampulha'],
        ];
        if ($tipo === 'ufs') {
            return ['SP' => 'São Paulo', 'RJ' => 'Rio de Janeiro', 'MG' => 'Minas Gerais', 'AC' => 'Acre (sem cidades na demonstração)'];
        }
        if ($tipo === 'cidades') {
            $uf = strtoupper((string) ($query['uf'] ?? ''));
            return ['data' => array_map(static fn (array $c): array => ['id' => $c[0], 'nome' => $c[1], 'regiao' => $c[2]], $cidades[$uf] ?? [])];
        }
        return $bairros[(int) ($query['cidade'] ?? 0)] ?? [];
    }

    /**
     * Consultas para o autopreenchimento (módulo alpine-form-preencher): CEP → endereço e CNPJ → empresa.
     * Dados fictícios; desconhecido → 404 { success: false }. ?ms=… atrasa a resposta.
     *
     * @param array<string, mixed> $query
     * @return array{0: int, 1: array<string, mixed>, 2: array<string, string>}
     */
    public static function consultaDemo(string $tipo, string $numero, array $query): array
    {
        usleep(max(0, min(5000, (int) ($query['ms'] ?? 0))) * 1000);
        $ceps = [
            '01001000' => ['cep' => '01001-000', 'logradouro' => 'Praça da Sé', 'bairro' => 'Sé', 'cidade' => 'São Paulo', 'uf' => 'SP', 'ibge' => '3550308'],
            '13010111' => ['cep' => '13010-111', 'logradouro' => 'Rua Barão de Jaguara', 'bairro' => 'Centro', 'cidade' => 'Campinas', 'uf' => 'SP', 'ibge' => '3509502'],
            '20040020' => ['cep' => '20040-020', 'logradouro' => 'Rua da Assembleia', 'bairro' => 'Centro', 'cidade' => 'Rio de Janeiro', 'uf' => 'RJ', 'ibge' => '3304557'],
            '24020000' => ['cep' => '24020-000', 'logradouro' => 'Rua da Conceição', 'bairro' => 'Ingá', 'cidade' => 'Niterói', 'uf' => 'RJ', 'ibge' => '3303302'],
            '30130010' => ['cep' => '30130-010', 'logradouro' => 'Praça Sete de Setembro', 'bairro' => 'Savassi', 'cidade' => 'Belo Horizonte', 'uf' => 'MG', 'ibge' => '3106200'],
        ];
        $empresas = [
            '11222333000181' => ['razao_social' => 'Empresa Exemplo Comércio Ltda', 'nome_fantasia' => 'Exemplo', 'situacao' => 'ATIVA', 'endereco' => ['cep' => '01001000', 'logradouro' => 'Praça da Sé', 'numero' => '100', 'uf' => 'SP']],
        ];
        $dados = $tipo === 'cep' ? ($ceps[$numero] ?? null) : ($empresas[$numero] ?? null);
        if ($dados === null) {
            return [404, ['success' => false, 'message' => $tipo === 'cep' ? 'CEP não encontrado.' : 'CNPJ não encontrado.'], []];
        }
        return [200, ['success' => true, 'data' => $dados], []];
    }

    /** Cadastro de demonstração: guarda o cliente na sessão para aparecer em /api/demo/clientes. */
    /** @param array<string, mixed> $data */
    private static function validarClienteDemo(array $data): Validator
    {
        $v = new Validator($data);
        if ($v->required('nome', 'Informe o nome.')) {
            $v->length('nome', 3, 80, 'O nome deve ter entre 3 e 80 caracteres.');
        }
        if ($v->required('email', 'Informe o e-mail.')) {
            $v->email('email', 'E-mail inválido.');
        }
        if (!in_array(strtoupper((string) ($data['uf'] ?? '')), ['SP', 'RJ', 'MG', 'RS', 'BA', 'PR', 'AC'], true)) {
            $v->add('uf', 'Escolha a UF.');
        }
        return $v;
    }

    private function cadastrarClienteDemo(Request $request): array
    {
        $data = $request->data();
        $v = self::validarClienteDemo($data);
        if ($v->fails()) {
            return $this->invalid($v->errors());
        }
        $uf = strtoupper((string) $data['uf']);
        $extras = (array) Session::get('clientes_extra', []);
        $cliente = [
            'id' => 1000 + count($extras) + 1,
            'nome' => trim((string) $data['nome']),
            'email' => strtolower(trim((string) $data['email'])),
            'uf' => $uf,
            'cidade' => trim((string) ($data['cidade'] ?? '')),
            'status' => 'pendente',
            'saldo' => '0.00',
            'criado_em' => date('Y-m-d'),
        ];
        $extras[] = $cliente;
        Session::set('clientes_extra', array_slice($extras, -50));
        Session::release();
        return $this->ok($cliente, 'Cliente cadastrado.');
    }

    /** CRUD de demonstração: sem id cadastra; com id guarda a edição na sessão. */
    private function salvarClienteDemo(Request $request): array
    {
        $data = $request->data();
        $id = (int) ($data['id'] ?? 0);
        if ($id <= 0) {
            return $this->cadastrarClienteDemo($request);
        }
        $v = self::validarClienteDemo($data);
        if ($v->fails()) {
            return $this->invalid($v->errors());
        }
        $ajustes = (array) Session::get('clientes_ajustes', []);
        $dados = [
            'nome' => trim((string) $data['nome']),
            'email' => strtolower(trim((string) $data['email'])),
            'uf' => strtoupper((string) $data['uf']),
            'cidade' => trim((string) ($data['cidade'] ?? '')),
        ];
        $ajustes['editados'][$id] = $dados;
        Session::set('clientes_ajustes', $ajustes);
        Session::release();
        return $this->ok(['id' => $id] + $dados, 'Cliente atualizado.');
    }

    private function excluirClienteDemo(Request $request): array
    {
        $id = (int) ($request->data()['id'] ?? 0);
        if ($id <= 0) {
            return [422, ['success' => false, 'message' => 'Cliente não informado.'], []];
        }
        $ajustes = (array) Session::get('clientes_ajustes', []);
        $ajustes['excluidos'][] = $id;
        Session::set('clientes_ajustes', $ajustes);
        Session::release();
        return $this->ok(['id' => $id], 'Cliente excluído.');
    }

    private function demo(string $scenario, Request $request): array
    {
        switch ($scenario) {
            case 'sucesso':
                return $this->ok(['recebido' => $request->data()], 'Recebido.');
            case 'erro-logico':
                return [200, ['success' => false, 'mensagem' => 'Operação recusada pela regra de negócio.', 'errors' => ['nome' => 'Nome reservado.', 'campo_inexistente' => ['Erro sem campo correspondente na tela.']], 'data' => null, 'request_id' => $this->requestId], []];
            case 'sem-conteudo':
                return [204, null, []];
            case 'html':
                return [200, '<!doctype html><html><body><h1>Entrar</h1><form><input type="password" name="senha"></form></body></html>', ['Content-Type' => 'text/html; charset=utf-8']];
            case 'texto':
                return [200, 'OK', ['Content-Type' => 'text/plain']];
            case 'erro-servidor':
                return [500, ['success' => false, 'message' => 'Falha interna simulada.', 'request_id' => $this->requestId], []];
            case 'nao-autorizado':
                return [401, ['success' => false, 'message' => 'Sessão expirada.'], []];
            case 'proibido':
                return [403, ['success' => false, 'message' => 'Sem permissão.'], []];
            case 'csrf':
                return [419, ['message' => 'CSRF token mismatch.'], []];
            case 'muito-grande':
                return [413, '<html><body>413 Request Entity Too Large</body></html>', ['Content-Type' => 'text/html']];
            case 'limite':
                return [429, ['success' => false, 'message' => 'Muitas requisições.'], ['Retry-After' => '30']];
            case 'clientes':
                return [200, self::listarClientes($request->query, (array) Session::get('clientes_extra', []), (array) Session::get('clientes_ajustes', [])), []];
            case 'clientes-salvar':
                return $this->salvarClienteDemo($request);
            case 'clientes-excluir':
                return $this->excluirClienteDemo($request);
            case 'clientes-novo':
                return $this->cadastrarClienteDemo($request);
            case 'ufs':
            case 'cidades':
            case 'bairros':
                return [200, self::opcoesDemo($scenario, $request->query), []];
            case 'lento':
                usleep(max(0, min(10000, (int) ($request->query['ms'] ?? 2500))) * 1000);
                return $this->ok(['recebido' => count($request->post)], 'Processado após espera.');
            case 'laravel':
                return [422, ['message' => 'The given data was invalid.', 'errors' => ['email' => ['O campo e-mail já está em uso.'], 'itens.0.nome' => ['Nome do item obrigatório.']]], []];
            case 'joomla':
                return [200, ['success' => false, 'message' => 'Não foi possível salvar.', 'messages' => ['error' => ['Token inválido ou permissão insuficiente.'], 'warning' => ['Alguns campos foram ignorados.']], 'data' => ['errors' => ['jform[title]' => 'Título obrigatório.']]], []];
            case 'redirect':
                return [200, ['success' => true, 'message' => 'Redirecionando...', 'redirect' => '/examples/index.php?ok=1'], []];
            case 'redirect-externo':
                return [200, ['success' => true, 'message' => 'Tentativa de redirecionamento externo.', 'redirect' => 'https://example.org/'], []];
            default:
                throw new HttpError(404, 'Cenário desconhecido.');
        }
    }
}
