// Sincroniza a producao com o Supabase automaticamente a partir de um .xlsx
// postado numa pasta do Google Drive -- sem precisar converter manualmente
// para Google Sheets nem editar planilha nenhuma.
//
// COMO FUNCIONA:
// A cada execucao, o script varre a pasta do Drive (ID_DA_PASTA), pega o .xlsx
// mais recentemente modificado, converte automaticamente para uma Google Sheet
// temporaria, le a aba "Plan Prod" (o arquivo precisa ter uma aba com esse
// nome exato, senao o script falha alto em vez de ler a aba errada), grava
// tudo no Supabase e apaga a Sheet temporaria em seguida. Tambem grava um
// snapshot do % de conclusao geral do dia em "producao_historico" (uma linha
// por dia -- usada pelo grafico de projecao do painel). Se o arquivo mais
// recente ja foi processado antes (mesmo ID + mesma data de modificacao), nao
// faz nada -- ou seja, o PCP so precisa postar o .xlsx na pasta, sem nenhuma
// acao manual extra.
//
// COMO INSTALAR (uma vez so):
// 1. Em https://script.google.com, clique em "Novo projeto" (este projeto NAO
//    precisa ficar dentro de nenhuma planilha -- e um projeto avulso).
// 2. Apague o conteudo de exemplo (inclusive a linha "function myFunction() {")
//    e COLE (Ctrl+V) este arquivo inteiro no lugar -- nao digite manualmente.
// 3. No menu a esquerda, clique em "Servicos" (icone +) e adicione o servico
//    avancado "Drive API". Se pedir para habilitar tambem no Google Cloud
//    Console associado, confirme.
// 4. Preencha ID_DA_PASTA, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY abaixo:
//    - ID_DA_PASTA: abra a pasta "CENA-PROD" no Drive e copie o trecho da URL
//      depois de "/folders/" (ex: .../folders/ESSE_ID_AQUI).
//    - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY: Project Settings > API Keys >
//      Legacy API Keys > service_role (string longa que comeca com "eyJ...",
//      NAO use a chave nova "sb_secret_...").
// 5. No menu de cima, troque a funcao selecionada para "criarGatilho" e clique
//    em Executar. Na primeira vez o Google vai pedir autorizacao (permita).
// 6. Pronto: a partir daí "sincronizar" roda sozinha a cada 15 minutos, mas so
//    processa de verdade quando ha um .xlsx novo na pasta.
//
// Para rodar manualmente e testar: selecione a funcao "sincronizar" e clique
// em Executar.

const ID_DA_PASTA = 'COLE_AQUI_O_ID_DA_PASTA_CENA-PROD_NO_DRIVE';
const SUPABASE_URL = 'COLE_AQUI_A_PROJECT_URL_DO_SUPABASE';
const SUPABASE_SERVICE_ROLE_KEY = 'COLE_AQUI_A_SERVICE_ROLE_KEY_LEGADA_DO_SUPABASE';
const NOME_DA_ABA = 'Plan Prod';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sincronizar() {
  const arquivo = encontrarXlsxMaisRecente_();
  if (!arquivo) {
    Logger.log('Nenhum .xlsx encontrado na pasta.');
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const chaveProcessado = arquivo.getId() + '|' + arquivo.getLastUpdated().getTime();
  if (props.getProperty('ULTIMO_PROCESSADO') === chaveProcessado) {
    Logger.log('Arquivo "' + arquivo.getName() + '" ja foi processado. Nada a fazer.');
    return;
  }

  Logger.log('Processando "' + arquivo.getName() + '"...');
  const planilhaTemp = converterParaGoogleSheets_(arquivo);
  try {
    const linhas = lerPlanilha_(planilhaTemp);
    Logger.log('Encontradas ' + linhas.length + ' linhas. Gravando no Supabase...');
    substituirTabelaSupabase_(linhas);
    gravarHistoricoSupabase_(linhas);
    props.setProperty('ULTIMO_PROCESSADO', chaveProcessado);
    Logger.log('Sincronizacao concluida com sucesso.');
  } finally {
    DriveApp.getFileById(planilhaTemp.getId()).setTrashed(true);
  }
}

function encontrarXlsxMaisRecente_() {
  const pasta = DriveApp.getFolderById(ID_DA_PASTA);
  const arquivos = pasta.getFilesByType(MIME_XLSX);
  let maisRecente = null;
  while (arquivos.hasNext()) {
    const arquivo = arquivos.next();
    if (!maisRecente || arquivo.getLastUpdated() > maisRecente.getLastUpdated()) {
      maisRecente = arquivo;
    }
  }
  return maisRecente;
}

function converterParaGoogleSheets_(arquivoXlsx) {
  const recurso = {
    title: arquivoXlsx.getName() + ' (convertido automaticamente)',
    parents: [{ id: ID_DA_PASTA }],
    mimeType: MimeType.GOOGLE_SHEETS,
  };
  const convertido = Drive.Files.insert(recurso, arquivoXlsx.getBlob());
  return SpreadsheetApp.openById(convertido.id);
}

function lerPlanilha_(planilha) {
  const aba = planilha.getSheetByName(NOME_DA_ABA);
  if (!aba) {
    const abasDisponiveis = planilha.getSheets().map(function(s) { return s.getName(); }).join(', ');
    throw new Error(
      'Nao encontrei uma aba chamada "' + NOME_DA_ABA + '" no arquivo. ' +
      'Abas disponiveis: ' + abasDisponiveis + '. ' +
      'Renomeie a aba correta para "' + NOME_DA_ABA + '" e suba o arquivo de novo.'
    );
  }

  const valores = aba.getDataRange().getValues();

  const idxCabecalho = valores.findIndex(function(linha) {
    return linha.map(function(c) { return String(c).trim().toUpperCase(); }).includes('DESCR');
  });
  if (idxCabecalho === -1) throw new Error('Nao encontrei a coluna DESCR na planilha.');

  const cabecalho = valores[idxCabecalho].map(function(h) { return String(h).trim().toUpperCase(); });
  const col = function(nome) { return cabecalho.indexOf(nome); };

  const idxCod = col('COD');
  const idxDescr = col('DESCR');
  const idxQtde = col('QTDE');
  const idxFluxo = col('FLUXO PROD');
  const idxDescrFluxo = col('DESCR FLUXO');
  const idxEtapa = col('ETAPA');
  const idxQtdeFin = col('QTDE FIN');
  const idxPct = col('% CONCLUSÃO');
  const idxStatus = col('STATUS');
  const idxCliente = col('CLIENTE');
  const idxObs = col('OBS');

  const linhasDados = valores.slice(idxCabecalho + 1);
  const resultado = [];
  for (let i = 0; i < linhasDados.length; i++) {
    const r = linhasDados[i];
    const vazia = r.every(function(c) { return c === '' || c === null || c === undefined; });
    if (vazia) continue;
    const descr = String(r[idxDescr] || '');
    if (!descr) continue;
    resultado.push({
      cod: String(r[idxCod] || ''),
      descr: descr,
      qtde: Number(r[idxQtde]) || 0,
      fluxo_prod: String(r[idxFluxo] || ''),
      descr_fluxo: String(r[idxDescrFluxo] || ''),
      etapa: String(r[idxEtapa] || '').trim().toUpperCase(),
      qtde_fin: Number(r[idxQtdeFin]) || 0,
      pct_conclusao: Number(r[idxPct]) || 0,
      status: String(r[idxStatus] || '').trim().toUpperCase(),
      cliente: String(r[idxCliente] || ''),
      obs: String(r[idxObs] || ''),
    });
  }
  return resultado;
}

function substituirTabelaSupabase_(linhas) {
  const base = SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };

  // Apaga tudo (espelho completo a cada sincronizacao)
  const respDel = UrlFetchApp.fetch(base + '/rest/v1/producao?id=gt.0', {
    method: 'delete',
    headers: headers,
    muteHttpExceptions: true,
  });
  if (respDel.getResponseCode() >= 300) {
    throw new Error('Falha ao limpar a tabela: ' + respDel.getContentText());
  }

  // Insere em lotes de 500 linhas
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    const headersIns = Object.assign({}, headers, { Prefer: 'return=minimal' });
    const respIns = UrlFetchApp.fetch(base + '/rest/v1/producao', {
      method: 'post',
      headers: headersIns,
      payload: JSON.stringify(lote),
      muteHttpExceptions: true,
    });
    if (respIns.getResponseCode() >= 300) {
      throw new Error('Falha ao inserir dados: ' + respIns.getContentText());
    }
  }
}

function gravarHistoricoSupabase_(linhas) {
  const qtdeTotal = linhas.reduce(function(a, r) { return a + r.qtde; }, 0);
  const qtdeFinTotal = linhas.reduce(function(a, r) { return a + r.qtde_fin; }, 0);
  const pctConclusao = qtdeTotal ? (qtdeFinTotal / qtdeTotal * 100) : 0;
  const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');

  const base = SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  // Upsert: uma linha por dia. Se ja existir uma linha de hoje, atualiza; senao, cria.
  const resp = UrlFetchApp.fetch(base + '/rest/v1/producao_historico?on_conflict=data', {
    method: 'post',
    headers: headers,
    payload: JSON.stringify([{
      data: hoje,
      qtde_total: qtdeTotal,
      qtde_fin_total: qtdeFinTotal,
      pct_conclusao: pctConclusao,
    }]),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Falha ao gravar historico: ' + resp.getContentText());
  }
}

function criarGatilho() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sincronizar') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(15).create();
  Logger.log('Gatilho criado: sincronizar vai rodar a cada 15 minutos.');
}
