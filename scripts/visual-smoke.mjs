import { mkdir, writeFile } from "node:fs/promises";
import { withChrome } from "./chrome-cdp.mjs";

const base=(process.env.BASE_URL || "http://127.0.0.1:4173/seedf-ppge-dashboard/").replace(/\/?$/,"/");
const routes=[
  ["home",""],["hoje","hoje/"],["mentor","mentor/"],["leis","leis/"],
  ["l01","leis/l01/"],["revisoes","revisoes/"],["erros","erros/"],
  ["desempenho","desempenho/"],["riscos","riscos/"],["edital","edital/"],
  ["qualidade","qualidade/"],["trilha","trilha/"],
];
const sizes=[[360,800],[390,844],[412,915],[768,1024],[1024,1366],[1440,900]];
await mkdir("artifacts/visual",{recursive:true});
const failures=[];
const report=[];

await withChrome(async({page})=>{
  const browser=await page(1440,900);
  try {
    for(const [routeName,route] of routes){
      for(const [width,height] of sizes){
        await browser.cdp.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<=520});
        await browser.navigate(base+route);
        let pageReadiness=null;
        if(routeName==="leis"){
          pageReadiness=await browser.cdp.evaluate("new Promise(resolve=>{let attempt=0;const inspect=()=>{const tracks=[...document.querySelectorAll('.laws-track-card')].map(node=>node.textContent.trim());const iconNode=document.querySelector('.reading-settings-trigger-icon');const icon=iconNode?.textContent.trim()||'';const trigger=document.querySelector('.reading-settings-trigger');const iconVisible=Boolean(iconNode&&iconNode.getBoundingClientRect().width>0&&getComputedStyle(iconNode).display!=='none'&&getComputedStyle(iconNode).visibility!=='hidden');const triggerVisible=Boolean(trigger&&trigger.getBoundingClientRect().width>0&&getComputedStyle(trigger).visibility!=='hidden');const triggerText=trigger?.innerText.trim()||'';const archive=[...document.querySelectorAll('#group-filter option')].find(option=>option.value==='Monitor')?.textContent.trim()||'';const sync=document.querySelector('.laws-sync')?.textContent.trim()||'';const metric=document.querySelector('.laws-stat-map small')?.textContent.trim()||'';const ready=Boolean(document.querySelector('.laws-cockpit')&&tracks.length&&icon&&iconVisible&&triggerVisible&&triggerText&&archive&&sync);if(ready||attempt>=60)return resolve({ready,tracks,icon,iconVisible,triggerVisible,triggerText,archive,sync,metric});attempt+=1;setTimeout(inspect,50)};inspect()})");
          if(!pageReadiness?.ready) failures.push("leis "+width+"x"+height+" conteúdo não carregou por completo");
          if(pageReadiness?.tracks?.length!==3||pageReadiness.tracks.some(name=>/Monitor/i.test(name))) failures.push("leis "+width+"x"+height+" Monitor apareceu como trilha ativa");
          if(pageReadiness?.icon!=="Aa"||!pageReadiness?.iconVisible||!pageReadiness?.triggerVisible||!pageReadiness?.triggerText?.includes("Conforto")) failures.push("leis "+width+"x"+height+" controle de conforto sem rótulo visível");
          if(!/Radar.*acervo/i.test(pageReadiness?.archive||"")) failures.push("leis "+width+"x"+height+" acervo Monitor sem rótulo de Radar");
          if(!pageReadiness?.sync?.includes("Versão dos dados")) failures.push("leis "+width+"x"+height+" versão sincronizada não visível");
          if(!/ativas.*Radar/i.test(pageReadiness?.metric||"")) failures.push("leis "+width+"x"+height+" resumo não identifica ativas e Radar");
        }
        const status=await browser.cdp.evaluate("({title:document.title,width:document.documentElement.scrollWidth,viewport:window.innerWidth,body:(document.body.innerText||'').slice(0,500)})");
        const overflow=Number(status.width)>Number(status.viewport)+2;
        const image=await browser.cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
        const filename="artifacts/visual/"+routeName+"-"+width+"x"+height+".png";
        await writeFile(filename,Buffer.from(image.data,"base64"));
        report.push({route:route||"/",width,height,overflow,title:status.title,readiness:pageReadiness});
        if(overflow) failures.push(routeName+" "+width+"x"+height+" scrollWidth="+status.width+" viewport="+status.viewport);
      }
    }
  } finally { await browser.close(); }
});
await writeFile("artifacts/visual/report.json",JSON.stringify(report,null,2)+"\n");
if(failures.length){
  console.error("Overflow horizontal detectado:\n"+failures.join("\n"));
  process.exit(1);
}
console.log("Visual QA: "+report.length+" screenshots, 12 rotas x 6 resoluções, sem overflow; /leis/ conferida por Radar, sincronização e controles móveis.");
