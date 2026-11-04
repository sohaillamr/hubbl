import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({mode}) => {
  Object.assign(process.env, loadEnv(mode,process.cwd(),''));
  return {plugins:[{name:'huddl-local-api',configureServer(server){
    server.middlewares.use('/api',async(req,res)=>{
      let raw='';for await(const part of req)raw+=part;
      try{req.body=raw?JSON.parse(raw):{}}catch{res.statusCode=400;res.end(JSON.stringify({error:'Invalid JSON'}));return}
      req.url='/api'+req.url;
      res.status=function(code){this.statusCode=code;return this};
      res.json=function(value){this.setHeader('Content-Type','application/json');this.end(JSON.stringify(value));return this};
      const {default:handler}=await import('./api/index.js');await handler(req,res);
    });
  }}]};
});
