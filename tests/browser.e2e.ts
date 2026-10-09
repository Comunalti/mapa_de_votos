import { test, expect } from '@playwright/test'

test.beforeEach(async ({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('voto-atlas:hide-tutorial','1');localStorage.removeItem('voto-atlas:calculation')});

  await page.route(/https:\/\/(resultados|cdn|divulgacandcontas)\.tse\.jus\.br\//,route=>route.abort('failed'))
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page.getByText('Conexão com o TSE indisponível')).toBeVisible()
})
test('hover previews return to the parent and hierarchy reaches a real electoral zone',async({page})=>{
  await page.getByRole('button',{name:'Explorar demonstração',exact:true}).click()
  await expect(page.locator('.candidate-card')).toHaveCount(60)
  const map=page.locator('.brazil-map')
  await expect(page.locator('.map-region-pin')).toHaveCount(5)
  await page.getByRole('button',{name:/Explorar região Sudeste/}).hover()
  await expect(map).toHaveAttribute('data-preview','Sudeste')
  await expect(map).toHaveAttribute('data-level','country')
  const rect=await map.boundingBox()
  await page.mouse.move(rect!.x+rect!.width-14,rect!.y+rect!.height*0.5)
  await expect(map).toHaveAttribute('data-preview','')
  await page.locator('.region-strip').getByRole('button',{name:/Sudeste/}).click()
  await expect(map).toHaveAttribute('data-level','region')
  const picker=page.locator('.map-state-picker')
  await picker.getByRole('button',{name:'Selecionar São Paulo',exact:true}).hover()
  await expect(map).toHaveAttribute('data-preview','São Paulo')
  await page.mouse.move(rect!.x+rect!.width-14,rect!.y+rect!.height*0.5)
  await expect(map).toHaveAttribute('data-preview','')
  await expect(map).toHaveAttribute('data-level','region')
  await picker.getByRole('button',{name:'Selecionar São Paulo',exact:true}).click()
  await expect(map).toHaveAttribute('data-level','state')
  await expect(page.locator('.candidate-card')).toHaveCount(12)
  await page.locator('.territory-button').click()
  await page.getByRole('textbox',{name:'Buscar localidade'}).fill('São Paulo')
  await page.locator('.territory-list').getByText('São Paulo',{exact:true}).click()
  await expect(page.locator('.territory-list').getByText('Zona eleitoral 1',{exact:true})).toBeVisible()
  await page.locator('.territory-list').getByText('Zona eleitoral 1',{exact:true}).click()
  await expect(map).toHaveAttribute('data-level','zone')
  await expect(page.locator('.breadcrumb')).toContainText('Zona 1')
  await page.getByRole('button',{name:'Voltar ao Brasil',exact:true}).click()
  await expect(map).toHaveAttribute('data-level','country')
  for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:812,height:480}]){
    await page.setViewportSize(viewport)
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1)).toBe(true)
    expect(await page.locator('.map-stage').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(80)
  }
})

test('imported nationwide expenses, FEFC and donations remain intact in a local estimate',async({page})=>{
  test.setTimeout(120000) // Software WebGL needs time for two geographic transitions in this fixture.
  await page.getByRole('button',{name:'Presidente',exact:true}).click()
  const common='ANO_ELEICAO;NR_TURNO;CD_CARGO;SQ_CANDIDATO;NM_URNA_CANDIDATO;NR_CANDIDATO;SG_PARTIDO;SG_UF;CD_MUNICIPIO;NR_ZONA;DS_SIT_TOT_TURNO;QT_VOTOS_NOMINAIS'
  const votes=common+'\n2026;1;1;990001;Pessoa Teste;99;TESTE;BR;;;ELEITO;1000\n2026;1;1;990001;Pessoa Teste;99;TESTE;SP;;;ELEITO;500\n2026;1;1;990001;Pessoa Teste;99;TESTE;SP;71072;1;ELEITO;200'
  const expenses='AA_ELEICAO;CD_CARGO;SQ_CANDIDATO;SG_UF;SQ_DESPESA;VR_DESPESA_CONTRATADA\n2026;1;990001;BR;1;10000,00'
  const receipts='AA_ELEICAO;CD_CARGO;SQ_CANDIDATO;SG_UF;SQ_RECEITA;VR_RECEITA;DS_FONTE_RECEITA;DS_ORIGEM_RECEITA\n2026;1;990001;BR;1;3000,00;Fundo Especial de Financiamento de Campanha;Recursos de partidos políticos\n2026;1;990001;BR;2;1000,00;Outros Recursos;Recursos de pessoas físicas'
  await page.getByRole('button',{name:'Fontes & dados'}).click()
  await page.locator('input[type=file]').setInputFiles([
    {name:'votacao_teste.csv',mimeType:'text/csv',buffer:Buffer.from(votes)},
    {name:'despesas_contratadas_teste.csv',mimeType:'text/csv',buffer:Buffer.from(expenses)},
    {name:'receitas_teste.csv',mimeType:'text/csv',buffer:Buffer.from(receipts)},
  ])
  await expect(page.getByText('Arquivos oficiais importados')).toBeVisible()
  await page.locator('.region-strip').getByRole('button',{name:/Sudeste/}).click()
  await page.locator('.map-state-picker').getByRole('button',{name:'Selecionar São Paulo',exact:true}).click()
  await page.locator('.candidate-card').first().click()
  await expect(page.locator('.fiche-totals').getByText('R$ 10.000,00',{exact:true})).toBeVisible()
  await expect(page.locator('.fiche-funding').getByText('R$ 3.000,00',{exact:true}).first()).toBeVisible()
  await expect(page.locator('.fiche-funding').getByText('R$ 1.000,00',{exact:true})).toBeVisible()
  await expect(page.locator('.fiche-estimate strong')).toHaveText('R$ 5.000,00')
  await page.keyboard.press('Escape')
  await page.locator('.territory-button').click()
  await page.getByRole('textbox',{name:'Buscar localidade'}).fill('São Paulo')
  await page.locator('.territory-list').getByText('São Paulo',{exact:true}).click()
  await page.locator('.territory-list').getByText('Zona eleitoral 1',{exact:true}).click()
  await page.locator('.candidate-card').first().click()
  await expect(page.locator('.fiche-totals').getByText('R$ 10.000,00',{exact:true})).toBeVisible()
  await expect(page.locator('.fiche-estimate strong')).toHaveText('R$ 2.000,00')
  await expect(page.locator('.fiche-estimate')).toContainText('R$ 10,00 / voto')
})

test('calculation settings update the ranking and tutorial can be revisited',async({page})=>{
 await page.getByRole('button',{name:'Explorar demonstração',exact:true}).click()
 const before=await page.locator('.featured-stat strong').innerText()
 await page.getByRole('button',{name:'Configurar cálculo'}).click()
 await page.getByRole('combobox',{name:'Base financeira do cálculo'}).selectOption('paid')
 await page.getByRole('button',{name:'Concluir',exact:true}).click()
 await expect(page.locator('.featured-stat strong')).not.toHaveText(before)
 await page.locator('.candidate-card').first().click()
 await expect(page.locator('.fiche-funding')).toBeVisible()
 await page.getByRole('button',{name:/Receitas da campanha/}).click()
 await expect(page.locator('.account-window .account-chart-row')).toHaveCount(4)
 await page.keyboard.press('Escape')
 await expect(page.locator('.account-overlay')).toHaveCount(0)
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'Ver tutorial'}).click()
 await expect(page.getByRole('dialog',{name:'Do Brasil à sua zona eleitoral.'})).toBeVisible()
 for(let i=0;i<5;i++)await page.getByRole('button',{name:'Próximo',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Custo por voto, com contexto.'})).toBeVisible()
 await page.getByRole('button',{name:'Explorar atlas',exact:true}).click()
})

test('municipal hover keeps the camera and picking surface stable',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'})
 await page.getByRole('button',{name:'Explorar demonstração',exact:true}).click()
 await page.locator('.region-strip').getByRole('button',{name:/Sudeste/}).click()
 await page.locator('.map-state-picker').getByRole('button',{name:'Selecionar São Paulo',exact:true}).click()
 await expect(page.locator('.brazil-map')).toHaveAttribute('data-level','state')
 await expect(page.locator('.map-data-progress')).toContainText('médias municipais calculadas')
 await page.waitForTimeout(2500)
 const map=page.locator('.brazil-map'),rect=await map.boundingBox()
 let found=false
 for(const[x,y]of [[.4,.5],[.55,.5],[.35,.4],[.6,.6],[.5,.65]]){
  await page.mouse.move(rect!.x+rect!.width*x,rect!.y+rect!.height*y)
  const preview=await map.getAttribute('data-preview')
  if(preview){found=true;break}
 }
 expect(found).toBe(true)
 const preview=await map.getAttribute('data-preview')
 const label=page.locator('.map-municipality-label')
 await expect(label).toBeVisible()
 const before=await label.boundingBox()
 await page.waitForTimeout(1100)
 await expect(map).toHaveAttribute('data-preview',preview!)
 const after=await label.boundingBox()
 expect(Math.abs(after!.x-before!.x)).toBeLessThan(1)
 expect(Math.abs(after!.y-before!.y)).toBeLessThan(1)
 await label.click()
 await expect(map).toHaveAttribute('data-level','municipality')
})
