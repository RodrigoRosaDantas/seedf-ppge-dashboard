import { withChrome } from "./chrome-cdp.mjs";

const base=(process.env.BASE_URL || "http://127.0.0.1:4173/seedf-ppge-dashboard/").replace(/\/?$/,"/");
const checks=[
  ["","Início"],["hoje/","Hoje"],["mentor/","Mentor"],["leis/","Leis Primeiro"],
  ["leis/l01/","L01"],["revisoes/","Revisões"],["desempenho/","Desempenho"],
  ["erros/","Caderno de erros"],["riscos/","Riscos"],["edital/","Edital"],
  ["qualidade/","Qualidade dos dados"],["trilha/","Trilha"],
];

await withChrome(async({page})=>{
  const browser=await page(390,844);
  try{
    for(const [route,marker] of checks){
      await browser.navigate(base+route);
      const result=await browser.cdp.evaluate("({text:(document.body.innerText||''),links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).filter(Boolean)})");
      if(!String(result.text).includes(marker)) throw new Error("E2E "+route+": marcador ausente: "+marker);
      if(String(result.text).includes("Não foi possível montar a inteligência")) throw new Error("E2E "+route+": inteligência não carregou.");
    }
    await browser.navigate(base+"trilha/");
    const opened=await browser.cdp.evaluate("new Promise(resolve=>{const button=[...document.querySelectorAll('button')].find(node=>(node.textContent||'').includes('Ler material'));if(!button)return resolve({ok:false,reason:'button'});button.click();let attempt=0;const check=()=>{const dialog=document.querySelector('[role=dialog]');const text=dialog?.innerText||'';if(text.includes('Não foi possível abrir o material dentro do site.'))return resolve({ok:false,reason:'reader-error',url:location.href,text});if(dialog&&text.includes('Notion ao vivo'))return resolve({ok:true,url:location.href,text});if(attempt>=180)return resolve({ok:false,reason:'timeout',url:location.href,text});attempt+=1;setTimeout(check,200)};check()})");
    if(!opened?.ok) throw new Error("E2E Trilha: leitor D01 não carregou do Notion ("+(opened?.reason||"desconhecido")+").");
    if(/notion\.so|app\.notion\.com/i.test(String(opened.url))) throw new Error("E2E Trilha: leitura navegou para o Notion.");
    if(!String(opened.text).includes("MATERIAL DO DIA")||!String(opened.text).includes("Notion ao vivo")) throw new Error("E2E Trilha: diálogo não confirmou conteúdo ao vivo.");

    await browser.navigate(base+"trilha/?material=D01");
    const deepLink=await browser.cdp.evaluate("new Promise(resolve=>{let attempt=0;const check=()=>{const dialog=document.querySelector('[role=dialog]');const text=dialog?.innerText||'';const source=[...document.querySelectorAll('[role=dialog] a')].find(a=>(a.textContent||'').includes('Fonte original no Notion'));if(text.includes('Não foi possível abrir o material dentro do site.'))return resolve({ok:false,reason:'reader-error',search:location.search,source:source?.getAttribute('href')||'',text});if(dialog&&text.includes('Notion ao vivo'))return resolve({ok:true,search:location.search,source:source?.getAttribute('href')||'',text});if(attempt>=180)return resolve({ok:false,reason:'timeout',search:location.search,source:source?.getAttribute('href')||'',text});attempt+=1;setTimeout(check,200)};check()})");
    if(!deepLink?.ok||!String(deepLink.search).includes("material=D01")) throw new Error("E2E Trilha: deep link D01 não carregou o leitor ao vivo ("+(deepLink?.reason||"desconhecido")+").");
    if(!/notion\.so|app\.notion\.com/i.test(String(deepLink.source))) throw new Error("E2E Trilha: fonte original do Notion não ficou separada no leitor.");

    await browser.navigate(base);
    const liveSync=await browser.cdp.evaluate("new Promise(resolve=>{const button=document.querySelector('button[aria-label=\"Sincronizar Study OS com o Notion agora\"]');if(!button)return resolve({ok:false,reason:'button',text:''});button.click();let attempt=0;const check=()=>{const text=document.querySelector('.os-sync')?.innerText||'';if(text.includes('Notion ao vivo'))return resolve({ok:true,text});if(text.includes('GitHub · backup'))return resolve({ok:false,reason:'fallback',text});if(attempt>=180)return resolve({ok:false,reason:'timeout',text});attempt+=1;setTimeout(check,200)};check()})");
    if(!liveSync?.ok) throw new Error("E2E Home: sincronização manual ao vivo falhou ("+(liveSync?.reason||"desconhecido")+") "+(liveSync?.text||""));

    const home=await browser.cdp.evaluate("({text:document.body.innerText||'',today:[...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('hoje/')),mentor:[...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('mentor/')),leis:[...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('leis/'))})");
    if(!home.today||!home.mentor||!home.leis) throw new Error("E2E Home: navegação operacional incompleta.");
    if(!home.text.includes("Executar agora")) throw new Error("E2E Home: CTA operacional ausente.");
  } finally { await browser.close(); }
});
console.log("E2E Study OS: fluxo operacional estratégico validado.");
