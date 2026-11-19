import {applyTheme,selectedTheme} from './theme.mjs';
import {createExecutor} from './engine.mjs';
import {TARGET_NAME,PROTOCOL} from '../src/protocol.mjs';
figma.showUI(__html__,{width:264,height:48,themeColors:true});
let documentId=figma.root.getPluginData('bridge-document-id');
let busy=false;
const errorText=error=>typeof error?.message==='string'?error.message:String(error??'未知插件错误');
const refreshTheme=()=>figma.ui.postMessage({type:'theme-option',selection:selectedTheme(figma)});
figma.on('selectionchange',refreshTheme);
figma.ui.onmessage=async message=>{
  try {
    if(message.type==='select-theme'){
      const selection=selectedTheme(figma);
      if(!selection || selection.frameId!==message.frameId || !selection.modes.includes(message.mode) ||
         message.mode===selection.active || busy || !documentId || figma.root.name!==TARGET_NAME ||
         figma.root.getPluginData('bridge-document-id')!==documentId){refreshTheme();return;}
      busy=true;
      try{
        const args={frameId:selection.frameId,pageId:figma.currentPage.id,mode:message.mode,dryRun:false};
        await applyTheme(figma,{request:{id:'ui-'+Date.now(),args},digest:JSON.stringify(args)});
      }catch(error){figma.notify(errorText(error),{error:true});}
      finally{busy=false;refreshTheme();}
      return;
    }
    if(message.type==='resize'){figma.ui.resize(264,message.expanded===true?(message.details===true?250:192):message.details===true?96:48);return;}
    if(message.type==='identify'){
      if(figma.root.name!==TARGET_NAME)throw Error('请在独立文件「'+TARGET_NAME+'」启动插件，现有 Demo 不会被修改。');
      if(!documentId){documentId='doc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);figma.root.setPluginData('bridge-document-id',documentId);}
      refreshTheme();figma.ui.postMessage({type:'identity',protocol:PROTOCOL,document:{id:documentId,name:figma.root.name}});return;
    }
    if(message.type==='execute'){
      if(busy)throw Error('插件正忙');busy=true;
      try{const result=await createExecutor(figma,documentId)(message);figma.ui.postMessage({type:'result',id:message.request.id,digest:message.digest,ok:true,...result});}
      catch(error){figma.ui.postMessage({type:'result',id:message.request.id,digest:message.digest,ok:false,error:errorText(error),uncertain:!!error?.uncertain});}
      finally{busy=false;if(message.request?.action==='design.theme')refreshTheme();}
    }
  }catch(error){figma.ui.postMessage({type:'error',error:errorText(error)});}
};
