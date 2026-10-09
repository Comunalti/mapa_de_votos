# Voto Atlas

Explore votos, candidaturas e financiamento eleitoral em um mapa 3D do Brasil. O Voto Atlas é uma SPA em React e TypeScript que funciona inteiramente no navegador, com dados públicos do TSE e malhas do IBGE.

Não há backend, banco de dados, autenticação ou chave de API. As consultas externas, a importação de arquivos e os cálculos acontecem no cliente. Dados preparados durante o desenvolvimento são publicados como arquivos estáticos junto da aplicação.

## Funcionalidades

- **Atlas interativo:** Brasil → região → estado → município → zona eleitoral, com foco de câmera, contornos destacados e seleção geográfica. O mapa ocupa o fundo da tela e usa tons de cinza; a área selecionada recebe destaque.
- **Painéis flutuantes:** indicadores, ranking e filtros podem ser minimizados. A página principal não tem rolagem geral; listas e janelas têm rolagem interna. No celular, há navegação entre Atlas e Candidatos.
- **Comparação de candidaturas:** busca, ordenação e filtros de partido, situação, votos mínimos, valor máximo por voto, disponibilidade financeira e recursos públicos.
- **Indicadores configuráveis:** escolha despesas contratadas, despesas pagas, receitas ou fundos públicos; configure rateio territorial, dedução de repasses e média ponderada ou simples.
- **Ficha da candidatura:** foto oficial quando disponível, situação eleitoral, valores da campanha integral e estimativa para a área selecionada.
- **Janelas empilhadas:** explore gráficos → grupos → registros individuais. Despesas mostram o documento, seus itens e os pagamentos vinculados ao lado, com barras de percentual pago. Escape retorna um nível.
- **Financiamento detalhado:** receitas agrupáveis por fonte, origem, natureza ou doador; FEFC, Fundo Partidário, doações e repasses identificados; despesas por tipo; pagamentos e saldo a conciliar.
- **Cadastro e histórico:** bens declarados com valores individuais e total, histórico de candidaturas e partidos, e contas dos diretórios partidários separadas por esfera.
- **Orientação inicial:** tutorial de navegação e explicações sobre fundos eleitorais, fundos partidários e repasses, com opção de reabrir depois.
- **Importação local:** CSV/ZIP oficiais processados em Web Worker, com progresso. Um modo de demonstração identificado permite explorar a interface com dados fictícios.

## Executar localmente

Requisitos: **Node.js 20.19+ ou 22.12+** e **pnpm**.

```sh
pnpm install
pnpm dev
```

Abra a URL informada pelo Vite, normalmente `http://127.0.0.1:5173/`.

```sh
pnpm test       # testes de dados e cálculos
pnpm build      # TypeScript e build de produção
pnpm preview    # conferir o build localmente
```

### Testes de navegador

Os testes com Playwright verificam a navegação, os filtros, a importação e a interface com fontes controladas. As chamadas externas são interceptadas para que a verificação não dependa da disponibilidade do TSE.

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

O Playwright inicia o Vite automaticamente ou reutiliza o servidor em `5173` quando não está em CI. Opcionalmente, pode usar um Chrome já instalado. No PowerShell:

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm test:e2e
```

Também é possível selecionar um canal instalado com `PLAYWRIGHT_BROWSER_CHANNEL`, por exemplo `chrome`. A configuração está em [playwright.config.ts](playwright.config.ts).

## Dados, fontes e disponibilidade

A interface oferece as eleições de **2026 e 2022** e os cargos de presidente, senador, deputado federal e deputado estadual/distrital. A disponibilidade varia por ano, cargo, turno, território e fonte.

| Informação | Origem e carregamento |
| --- | --- |
| Votos e situação eleitoral | Serviços públicos de resultados do TSE, consultados no navegador; importação local como alternativa |
| Totais financeiros | Extração oficial datada incluída no build, arquivos importados ou tentativa de consulta ao DivulgaCandContas quando não há extração |
| Receitas, despesas e pagamentos individuais | Extratos oficiais preparados em blocos comprimidos, carregados ao abrir a candidatura |
| Cadastro, bens e histórico | Arquivo de perfis preparado a partir dos dados abertos do TSE |
| Contas partidárias | Arquivo preparado com declarações dos diretórios, separado por esfera |
| Fotos | Endpoints oficiais do TSE; carregamento sob demanda e iniciais quando indisponíveis |
| Regiões, estados e municípios | Malhas e cadastro do IBGE |
| Códigos municipais e zonas eleitorais | Configuração oficial da eleição no TSE |

O repositório inclui os arquivos preparados de **2026** em `public/data/`. Esses arquivos permitem consultar seus dados financeiros sem acessar o serviço de contas do TSE a cada abertura, mas não transformam toda a aplicação em uma base offline de resultados. **Não há extração de 2022 incluída por padrão:** esse ano depende das consultas externas e dos arquivos que forem importados ou preparados.

Cada extração registra sua origem e data; o resumo financeiro também registra o hash SHA-256 do arquivo de origem. A tela identifica os dados preparados e a cobertura disponível. O botão de atualização consulta os serviços e relê os arquivos incluídos; ele não reconstrói a extração publicada. Para atualizar esses arquivos, execute os scripts abaixo e publique um novo build.

As fontes de cadastro, totalização e contas são atualizadas em momentos diferentes. Durante a eleição e a apresentação das contas, os registros podem ser parciais ou retificados. Confira a data da fonte e a situação na página oficial antes de comparar números.

Consultas diretas dependem de CORS, disponibilidade dos serviços e proteção contra robôs. A aplicação informa falhas ou cobertura parcial. Campos indisponíveis permanecem como `—`; não são convertidos em zero nem preenchidos com dados demonstrativos.

### Fontes oficiais

- [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br/)
- [Candidaturas de 2026](https://dadosabertos.tse.jus.br/dataset/candidatos-2026)
- [Prestação de contas eleitorais de 2026](https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-2026)
- [DivulgaCandContas](https://divulgacandcontas.tse.jus.br/divulga/)
- [Resultados eleitorais do TSE](https://resultados.tse.jus.br/)
- [Catálogo de eleições utilizado pela aplicação](https://resultados.tse.jus.br/oficial/comum/config/ele-c.json)
- [API de Malhas do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3)
- [Cadastro de municípios do IBGE](https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome)
- [Explicação do TSE sobre Fundo Eleitoral e Fundo Partidário](https://www.tse.jus.br/comunicacao/noticias/2021/Novembro/fundo-eleitoral-x-fundo-partidario-entenda-a-diferenca)

## Metodologia dos indicadores

### Votos e custo por voto

O denominador usa **votos nominais do candidato no turno selecionado**. Votos de legenda não entram e turnos diferentes não são somados.

A base padrão é a despesa contratada da campanha. Em **Configurar cálculo**, é possível escolher:

| Opção | Efeito |
| --- | --- |
| Despesas contratadas | Compromissos declarados da campanha |
| Despesas pagas | Pagamentos declarados |
| Receitas arrecadadas | Financiamento recebido; o indicador por voto não representa gasto |
| FEFC + Fundo Partidário | Recursos públicos identificados; o indicador por voto não representa gasto |
| Deduzir repasses | Desconta transferências identificadas na base de despesas; na base paga, utiliza apenas repasses pagos |
| Rateio proporcional | Atribui à área uma estimativa baseada em sua participação nos votos da campanha |
| Base integral | Compara a base inteira com os votos do território selecionado, sem rateio |
| Média ponderada ou simples | Escolhe a razão agregada ou a média das taxas individuais disponíveis |

No modo proporcional:

```text
taxa da campanha = base financeira ÷ votos totais da campanha
estimativa da área = base financeira × votos na área ÷ votos totais da campanha
```

A estimativa **não informa onde o dinheiro foi efetivamente gasto**. Receitas, FEFC e doações declaradas permanecem apresentados no âmbito da campanha; não são redistribuídos como declarações territoriais. Para presidente, os valores financeiros são nacionais.

No modo de base integral, a taxa usa a base inteira dividida pelos votos da área selecionada. Essa escolha responde a uma comparação diferente e deve ser considerada ao interpretar o ranking.

A média ponderada divide a soma das bases atribuídas às candidaturas com dados completos pela soma dos respectivos votos locais. A média simples considera as taxas individuais disponíveis. A cobertura acompanha os indicadores; valores desconhecidos não entram como zero. Sem denominador conhecido e positivo, o custo por voto permanece indisponível. Deduções desconhecidas ou superiores à base também deixam o cálculo indisponível.

Contas podem abranger períodos dos dois turnos. A aplicação não divide artificialmente os gastos por turno: cada comparação usa os votos do turno selecionado e a conta integral disponível. Valores de anos diferentes são nominais, sem correção de inflação.

### Contratado, pago e saldo a conciliar

Despesas contratadas e despesas pagas são medidas distintas. **Não se somam as duas**, pois isso pode contar o mesmo compromisso duas vezes. “Total bruto recebido” pertence às receitas.

Um registro de despesa pode representar um documento com vários itens; não é necessariamente um contrato formal. Na preparação dos extratos:

- A candidatura é identificada por `SQ_CANDIDATO` e ano, sem correspondência aproximada por nome.
- Documentos e pagamentos são relacionados por **`SQ_PRESTADOR_CONTAS + SQ_DESPESA`**.
- Todas as linhas oficiais de itens e pagamentos são preservadas. Um identificador repetido ou dois itens com descrição e valor iguais não comprovam duplicidade.
- Arquivos nacionais que espelham os mesmos dados por UF não são somados novamente.
- Pagamentos são associados ao documento completo, sem rateio inventado entre seus itens. Pagamentos sem vínculo permanecem separados.

O saldo exibido por documento é `máximo(contratado − pagamentos vinculados, 0)`, quando o vínculo permite o cálculo. A diferença geral mantém o sinal. Pagamentos excedentes e sem vínculo são apresentados para conciliação. As barras limitam o preenchimento a 100%, mas o texto preserva o percentual real quando ele supera esse valor.

Esse saldo **não é uma dívida confirmada**. Receitas e despesas podem incluir valores estimáveis, registros parciais e alterações posteriores; nem todo valor declarado corresponde a uma transferência financeira.

### Fundos e repasses

FEFC, Fundo Partidário, recursos próprios e doações são identificados pelas classificações da fonte. Doações privadas incluem pessoas físicas e financiamento coletivo identificados; origem desconhecida permanece desconhecida.

A ficha distingue fundos recebidos do partido, recursos de outras candidaturas e doações individuais/coletivas. Esses recortes podem se sobrepor: um repasse de outra candidatura pode conter FEFC. Eles não devem ser somados novamente ao total recebido.

Transferências também podem aparecer nas despesas do remetente e nas receitas do destinatário. A soma de contas não é, por si só, o custo econômico da eleição sem duplicação. As contas dos diretórios são separadas por esfera nacional, estadual e municipal; somá-las indiscriminadamente pode contar repasses internos várias vezes.

### Situação, bens e histórico

Eleito, não eleito, segundo turno e pendente seguem a totalização informada pela fonte. Suplência não é apresentada como eleição para uma vaga naquela totalização. **Reeleito** exige resultado eleito e indicação oficial de reeleição; vitórias em eleições anteriores não substituem essa indicação.

Os bens representam declarações de candidatura, com valores individuais e soma disponível. O histórico mostra os registros eleitorais e partidos encontrados na fonte; não inventa votos ausentes. Identificadores pessoais desnecessários não são publicados como campos estruturados, e descrições de bens passam por omissão de identificadores financeiros e endereços.

Os indicadores não medem mérito político, regularidade do uso dos recursos ou aprovação das contas.

## Importar CSV/ZIP no navegador

Abra **Fontes & dados → Selecionar CSV / ZIP** e selecione arquivos oficiais da mesma eleição:

- Cadastro de candidatos.
- Votação nominal por município/zona.
- Receitas de candidatos.
- Despesas contratadas de candidatos.

Os arquivos ficam na memória da aba. Recarregar a página remove a importação; os arquivos não são enviados a um servidor. Preferências de interface e de cálculo podem ser salvas no armazenamento local do navegador.

A importação reconhece CSV UTF-8 e Windows-1252/Latin-1 e processa ZIP por tabela em Web Worker. Tabelas auxiliares incompatíveis, incluindo doador originário e despesas pagas, são ignoradas nessa importação. Os pagamentos detalhados da ficha vêm dos extratos preparados, e não de um ZIP local de pagamentos.

Use arquivos consistentes, sem misturar versões ou níveis que representam os mesmos votos. Prefira votação nominal por município/zona com `SQ_CANDIDATO`; não misture votação por seção com votação já agregada. Importar novamente o mesmo arquivo não deve duplicar seus valores, mas essa proteção não torna qualquer combinação de arquivos incompatíveis válida.

Para presidente, o custo nacional exige um total explícito BR ou cobertura comum das 27 UFs e do exterior (ZZ). Uma importação parcial mantém as finanças declaradas, mas não permite inventar o total nacional de votos nem o rateio correspondente.

Limites atuais: **768 MB por arquivo selecionado** e **384 MB por CSV descompactado**. Arquivos grandes também dependem da memória disponível. Comece por uma UF; para arquivos maiores, extraia o ZIP e selecione os CSV por UF. Leia o `leiame.pdf` fornecido pelo TSE para conferir estrutura e data.

## Atualizar os dados preparados

Execute os comandos na raiz do projeto, após `pnpm install`. Os scripts baixam dados públicos e geram arquivos em `public/data/`; são ferramentas de preparação, não serviços necessários em produção.

```sh
node scripts/sync-candidate-profiles.mjs 2026
node scripts/sync-tse-finance.mjs 2026
node scripts/sync-party-accounts.mjs 2026
```

| Script | Saída principal |
| --- | --- |
| `sync-candidate-profiles.mjs` | `profiles-2026.json`: cadastro, bens e histórico |
| `sync-tse-finance.mjs` | `finance-2026.json` e `details-2026/*.json.gz`: totais e extratos |
| `sync-party-accounts.mjs` | `parties-2026.json`: contas dos diretórios |

O script de contas partidárias reutiliza seu cache de origem em `.artifacts/`. Para obter um arquivo recém-publicado pelo TSE, confira e renove o cache daquele ano antes da execução. O script financeiro baixa a fonte novamente em cada execução. Caches, arquivos brutos e artefatos locais não precisam ser publicados.

Os scripts recebem o ano como argumento, mas cada fonte precisa existir e manter um formato compatível. Gerar arquivos de outro ano não garante que todos os recursos detalhados estejam disponíveis. Antes de publicar uma atualização, confira datas, mensagens dos scripts e testes.

### Malhas, municípios e zonas

Para atualizar o cadastro e as malhas municipais a partir das APIs, use **PowerShell 7**:

```powershell
pwsh -File scripts/sync-territories.ps1 -Year 2026
```

O script descobre o ID eleitoral, relaciona os códigos TSE e IBGE pelo campo explícito `cdi` e valida as malhas. Códigos TSE de cinco dígitos e IBGE de sete dígitos não são intercambiáveis; a aplicação não adivinha a relação pelo nome.

Os arquivos incluídos cobrem as 27 UFs e 5.571 unidades municipais do cadastro utilizado, incluindo Brasília e Fernando de Noronha. Para Mato Grosso, a [Malha Municipal oficial de 2025](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/MT/MT_Municipios_2025.zip) complementou a divisão disponível na API para incluir Boa Esperança do Norte. Esse caso deve ser conferido ao regenerar as malhas.

O conversor de shapefile requer **Python 3** e usa apenas a biblioteca padrão. Exemplo de conversão do ZIP oficial de MT:

```sh
python scripts/convert-municipality-shapefile.py MT_Municipios_2025.zip public/data/municipalities/mt.json
```

A simplificação compartilha os arcos das fronteiras para manter os limites adjacentes coerentes. Confira o cadastro e as geometrias depois de substituir uma malha.

As zonas eleitorais vêm da configuração oficial do TSE. A fonte utilizada não fornece seus polígonos: elas são seletores no contexto municipal. Uma mesma zona pode abranger vários municípios; o filtro combina a zona com o município selecionado. Sem configuração disponível para um ano, a interface informa a limitação.

## Build e hospedagem estática

`pnpm build` produz o diretório `dist/`, que pode ser servido por uma hospedagem estática. Publique o diretório completo, incluindo `data/`, os blocos comprimidos e as malhas.

Para hospedar na raiz de um domínio:

```sh
pnpm build
```

Para GitHub Pages de um repositório, ajuste a base ao nome real do repositório:

```sh
pnpm build --base=/nome-do-repositorio/
```

Também é possível definir `base` em [vite.config.ts](vite.config.ts). Os carregamentos locais utilizam essa base. Este repositório não configura publicação automática nem exige conta ou credenciais do GitHub para rodar localmente.

Confira o build com `pnpm preview` antes de publicar. A hospedagem estática não altera as políticas CORS dos serviços do TSE; uma consulta disponível em uma origem pode estar bloqueada em outra.

## Estrutura do projeto

```text
src/
  components/       Mapa, ranking, ficha, gráficos, janelas e tutorial
  data/             Consultas TSE, fotos, importação e workers
  hooks/            Carregamento, cache e estado dos dados
  lib/              Cálculos, métricas, filtros e formatação
  types.ts          Tipos compartilhados
public/
  brazil-states.json
  data/             Perfis, finanças, extratos, partidos e malhas
scripts/            Preparação de dados TSE/IBGE
tests/              Testes de dados, cálculos e interação
```

Tecnologias principais: React 19, TypeScript, Vite, Three.js, React Three Fiber/Drei, Papa Parse, fflate, Vitest e Playwright. A renderização 3D usa WebGL; há uma alternativa SVG para a navegação geográfica quando WebGL não está disponível.
