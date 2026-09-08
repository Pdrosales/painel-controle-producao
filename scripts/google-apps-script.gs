/**
 * Sincroniza a aba "Plan Prod" desta planilha Google Sheets com a tabela `producao`
 * no Supabase. Roda automaticamente dentro do próprio Google (sem servidor externo,
 * sem GitHub, sem Azure), usando um gatilho de tempo.
 *
 * COMO INSTALAR (uma vez só):
 * 1. Nesta planilha, vá em Extensões > Apps Script.
 * 2. Apague o conteúdo de exemplo e cole este arquivo inteiro.
 * 3. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY abaixo com os valores do
 *    seu projeto Supabase (Project Settings > API). Esse código só é visível para
 *    quem você convidar como editor deste projeto de script — não fica público.
 * 4. No menu de cima, troque a função selecionada para "criarGatilho" e clique em
 *    Executar (▶). Na primeira vez, o Google vai pedir para autorizar o script
 *    (é a sua própria conta autorizando a si mesma — normal, clique em Avançar >
 *    Permitir).
 * 5. Pronto: a partir daí, "sincronizar" roda sozinha a cada 15 minutos.
 *
 * Para rodar manualmente e testar: selecione a função "sincronizar" e clique em ▶.
 */

const SUPABASE_URL = 'COLE_AQUI_A_PROJECT_URL_DO_SUPABASE';
const SUPABASE_SERVICE_ROLE_KEY = 'COLE_AQUI_A_SECRET_KEY_DO_SUPABASE';
const NOME_DA_ABA = 'Plan Prod';

function sincronizar() {
  const linhas = lerPlanilha_();
  Logger.log('Encontradas ' + linhas.length + ' linhas. Gravando no Supabase...');
  substituirTabelaSupabase_(linhas);
  Logger.log('Sincronização concluída com sucesso.');
}

function lerPlanilha_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOME_DA_ABA);
  if (!aba) throw new Error('Não encontrei uma aba chamada "' + NOME_DA_ABA + '".');

  const valores = aba.getDataRange().getValues();

  const idxCabecalho = valores.findIndex((linha) =>
    linha.map((c) => String(c).trim().toUpperCase()).includes('DESCR')
  );
  if (idxCabecalho === -1) throw new Error('Não encontrei a coluna "DESCR" na planilha.');

  const cabecalho = valores[idxCabecalho].map((h) => String(h).trim().toUpperCase());
  const col = (nome) => cabecalho.indexOf(nome);

  const idx = {
    cod: col('COD'), descr: col('DESCR'), qtde: col('QTDE'),
    fluxo: col('FLUXO PROD'), descrFluxo: col('DESCR FLUXO'), etapa: col('ETAPA'),
    qtdeFin: col('QTDE FIN'), pct: col('% CONCLUSÃO'), status: col('STATUS'),
    cliente: col('CLIENTE'), obs: col('OBS'),
  };

  return valores
    .slice(idxCabecalho + 1)
    .filter((r) => r.some((c) => c !== '' && c !== null && c !== undefined))
    .map((r) => ({
      cod: String(r[idx.cod] ?? ''),
      descr: String(r[idx.descr] ?? ''),
      qtde: Number(r[idx.qtde]) || 0,
      fluxo_prod: String(r[idx.fluxo] ?? ''),
      descr_fluxo: String(r[idx.descrFluxo] ?? ''),
      etapa: String(r[idx.etapa] ?? '').trim().toUpperCase(),
      qtde_fin: Number(r[idx.qtdeFin]) || 0,
      pct_conclusao: Number(r[idx.pct]) || 0,
      status: String(r[idx.status] ?? '').trim().toUpperCase(),
      cliente: String(r[idx.cliente] ?? ''),
      obs: String(r[idx.obs] ?? ''),
    }))
    .filter((linha) => linha.descr);
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
    const respIns = UrlFetchApp.fetch(base + '/rest/v1/producao', {
      method: 'post',
      headers: Object.assign({}, headers, { Prefer: 'return=minimal' }),
      payload: JSON.stringify(lote),
      muteHttpExceptions: true,
    });
    if (respIns.getResponseCode() >= 300) {
      throw new Error('Falha ao inserir dados: ' + respIns.getContentText());
    }
  }
}

function criarGatilho() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sincronizar')
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(15).create();
  Logger.log('Gatilho criado: "sincronizar" vai rodar a cada 15 minutos.');
}
