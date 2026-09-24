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
        const status=await browser.cdp.evaluate("({title:document.title,width:document.documentElement.scrollWidth,viewport:window.innerWidth,body:(document.body.innerText||'').slice(0,500)})");
        const overflow=Number(status.width)>Number(status.viewport)+2;
        const image=await browser.cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
        const filename="artifacts/visual/"+routeName+"-"+width+"x"+height+".png";
        await writeFile(filename,Buffer.from(image.data,"base64"));
        report.push({route:route||"/",width,height,overflow,title:status.title});
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
console.log("Visual QA: "+report.length+" screenshots, 12 rotas x 6 resoluções, sem overflow horizontal.");
