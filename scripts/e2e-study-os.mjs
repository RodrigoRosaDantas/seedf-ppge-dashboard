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
    await browser.navigate(base);
    const home=await browser.cdp.evaluate("({text:document.body.innerText||'',today:[...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('hoje/')),mentor:[...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('mentor/')),leis:[...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('leis/'))})");
    if(!home.today||!home.mentor||!home.leis) throw new Error("E2E Home: navegação operacional incompleta.");
    if(!home.text.includes("Executar agora")) throw new Error("E2E Home: CTA operacional ausente.");
  } finally { await browser.close(); }
});
console.log("E2E Study OS: fluxo operacional estratégico validado.");
