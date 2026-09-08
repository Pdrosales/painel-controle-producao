/**
 * Sincroniza a aba "Plan Prod" desta planilha Google Sheets com a tabela `producao`
 * no Supabase. Roda automaticamente dentro do próprio Google (sem servidor externo,
 * sem GitHub, sem Azure), usando um gatilho de tempo.
 *
 * COMO INSTALAR (uma vez só):
 * 1. Nesta planilha, vá em Extensões > Apps Script.
 * 2. Apague TODO o conteúdo de exemplo (inclusive a linha "function myFunction() {")
 *    e cole este arquivo inteiro no lugar.
 * 3. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY abaixo com os valores do
 *    seu projeto Supabase (Project Settings > API Keys > Legacy API Keys > service_role,
 *    uma string longa que começa com "eyJ..." — NÃO use a chave no formato novo
 *    "sb_secret_...", ela é rejeitada pelo Supabase quando usada fora de um servidor).
 *    Esse código só é visível para quem você convidar como editor deste projeto de
 *    script — não fica público.
 * 4. No menu de cima, troque a função selecionada para "criarGatilho" e clique em
 *    Executar (▶). Na primeira vez, o Google vai pedir para autorizar o script
 *    (é a sua própria conta autorizando a si mesma — normal, clique em Avançar >
 *    Permitir).
 * 5. Pronto: a partir daí, "sincronizar" roda sozinha a cada 15 minutos.
 *
 * Para rodar manualmente e testar: selecione a função "sincronizar" e clique em ▶.
 */

const SUPABASE_URL = 'COLE_AQUI_A_PROJECT_URL_DO_SUPABASE';
const SUPABASE_SERVICE_ROLE_KEY = 'COLE_AQUI_A_SERVICE_ROLE_KEY_LEGADA_DO_SUPABASE';
const NOME_DA_ABA = 'Plan Prod';

function sincronizar() {
  const linhas = lerPlanilha_();
  Logger.log('Encontradas ' + linhas.length + ' linhas. Gravando no Supabase...');
  substituirTabelaSupabase_(linhas);
  Logger.log('Sincronizacao concluida com sucesso.');
}

function lerPlanilha_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_DA_ABA);
  if (!aba) throw new Error('Nao encontrei uma aba chamada ' + NOME_DA_ABA);

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

  // Apaga tudo (espelho completo a cada sincronização)
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
