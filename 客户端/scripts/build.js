const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const {packager}=await import('@electron/packager');
 const root=path.resolve(__dirname,'..'),stage=path.join(root,'.stage');
 const core=path.resolve(root,'../信息层/xuanhuai-platform');
 await fs.rm(stage,{recursive:true,force:true});await fs.mkdir(stage,{recursive:true});
 for(const file of ['main.js','preload.js','runtime.js'])await fs.copyFile(path.join(root,file),path.join(stage,file));
 await fs.cp(path.join(root,'ui'),path.join(stage,'ui'),{recursive:true});
 await fs.mkdir(path.join(stage,'core'));
 for(const file of ['server.js','mcp.js','AGENT-GUIDE.md'])await fs.copyFile(path.join(core,file),path.join(stage,'core',file));
 // Bundle checked-in historical fixtures only; live accounts and private data stay local.
 await fs.copyFile(path.join(core,'seed.json'),path.join(stage,'core/seed.json'));
 await fs.cp(path.join(core,'lib'),path.join(stage,'core/lib'),{recursive:true});
 const articles=path.resolve(core,'../天津大学宣怀学院公众号资料库/文章');
 for(const item of await fs.readdir(articles,{withFileTypes:true})){
  if(!item.isDirectory())continue;
  const article=path.join(articles,item.name,'文章.md');
  try{await fs.access(article);}catch{continue;}
  await fs.mkdir(path.join(stage,'articles',item.name),{recursive:true});await fs.copyFile(article,path.join(stage,'articles',item.name,'文章.md'));
 }
 const sourcePackage=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'xuanhuai-agent',version:sourcePackage.version,main:'main.js',productName:'宣怀 Agent',description:sourcePackage.description}));
 const paths=await packager({dir:stage,name:'宣怀 Agent',appBundleId:'local.xuanhuai.agent',platform:'darwin',arch:'arm64',electronVersion:sourcePackage.devDependencies.electron,out:path.join(root,'dist'),overwrite:true,asar:false,icon:path.join(root,'assets/icon.icns'),appCategoryType:'public.app-category.productivity',extendInfo:{NSHumanReadableCopyright:'宣怀 Agent · 本地验证版'}});
 console.log('Built:',paths.join('\n'));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
