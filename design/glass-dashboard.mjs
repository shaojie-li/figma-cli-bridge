import {readFileSync} from 'node:fs';

const [inventoryPath,pageId]=process.argv.slice(2);
const {result:inventory}=JSON.parse(readFileSync(inventoryPath,'utf8'));
const find=(items,name)=>{
  const matches=items.filter(item=>item.name===name);
  if(matches.length!==1)throw Error(`需要唯一资产：${name}`);
  return matches[0].id;
};
const color=Object.fromEntries(Object.entries({
  canvas:'color/canvas', ink:'color/fg',
  muted:'color/fg-muted', blue:'color/primary', red:'color/danger',
  line:'color/secondary-border', lavender:'color/primary-hover'
}).map(([key,name])=>[key,find(inventory.variables,name)]));
const type=Object.fromEntries(Object.entries({large:'Heading/Large',body:'Body/Default',small:'Label/Small'}).map(([key,name])=>[key,find(inventory.textStyles,name)]));
const text=(name,content,style='body',tone='ink',options={})=>({kind:'text',name,text:content,styleId:type[style],color:color[tone],...options});
const stack=(name,direction,children,options={})=>({kind:'stack',name,direction,padding:0,gap:0,children,...options});
const col=(name,children,options)=>stack(name,'VERTICAL',children,options);
const row=(name,children,options)=>stack(name,'HORIZONTAL',children,options);
const material={background:color.canvas,paintOpacity:0.54,glass:{outline:color.canvas,blur:24},radius:24,padding:24};
const fill={fill:true};
const between={distribution:'SPACE_BETWEEN'};
const center={align:'CENTER'};
const badge=(name,label,tone='blue')=>row(name,[text('Label',label,'small',tone)],{padding:4,radius:8,background:color[tone],paintOpacity:0.09});
const swatch=(name,width,height,tone,paintOpacity=1,radius=0)=>col(name,[],{width,height,background:color[tone],paintOpacity,radius});
const rule=(name,width)=>col(name,[],{...(width?{width}:{}),height:1,background:color.line,paintOpacity:0.18});

const nav=([
  ['01','运营总览'],['02','全部工单'],['03','值班队列'],['04','团队设置']
]).map(([number,label],index)=>row(`Navigation${number}`,[text('Index',number,'small',index?'muted':'blue'),text('Label',label,'body',index?'ink':'blue')],{
  ...center,gap:12,padding:12,radius:12,...(index?{}:{background:color.blue,paintOpacity:0.1})
}));
const rail=col('NavigationRail',[
  col('WorkspaceNavigation',[
    row('Brand',[row('Monogram',[text('Letter','N','body','blue')],{padding:8,radius:12,background:color.blue,paintOpacity:0.12}),
      col('ProductName',[text('Name','北岸服务台'),text('Descriptor','NORTHLINE OPS','small','muted')],{fill:true})],{...center,gap:12}),
    col('Menu',[text('MenuLabel','工作区','small','muted'),...nav],{gap:4})
  ],{gap:40}),
  col('Shift',[rule('Separator'),text('Operator','华东支持组'),text('ShiftTime','日班 · 09:00–18:00','small','muted')],{gap:8})
],{...material,width:224,height:924,...between});

const button=inventory.nodes.find(node=>node.type==='COMPONENT'&&node.name==='Intent=Primary, Size=Md, State=Rest, Focus=False');
const definitions=inventory.nodes.find(node=>node.id===button.parentId).componentPropertyDefinitions;
const property=name=>Object.keys(definitions).find(key=>key.startsWith(`${name}#`));
const primary={kind:'instance',name:'CreateTicketAction',width:128,mainId:button.id,properties:{[property('Label')]:'新建工单',[property('ShowLeadingIcon')]:false}};
const header=row('Header',[
  col('Introduction',[text('Context','服务运营  /  本周概览','small','blue'),text('Title','工单运营总览','large'),text('Description','追踪工单流量，优先处理即将超时的请求。','body','muted')],{gap:4,...fill}),primary
],{...center,gap:16,height:96});

const metrics=row('Metrics',[
  ['OpenTickets','待处理工单','128','24 单待分配','blue'],
  ['FirstResponse','首次响应中位数','18 分钟','较上周缩短 4 分钟','blue'],
  ['SlaAttainment','SLA 达标率','96.8%','较上周上升 1.2 个百分点','blue']
].map(([name,label,value,note,tone])=>col(name,[text('Label',label,'small','muted'),text('Value',value,'large'),text('Context',note,'small',tone)],{
  ...material,padding:16,height:124,gap:4
})),{equalColumns:true,gap:16});

const daily=[34,42,38,57,44,26,19];
const bars=daily.map((value,index)=>col(`Day${index+1}`,[
  col('PlotColumn',[text('Count',`${value}`,'small',index===3?'blue':'muted',{width:32,textAlign:'CENTER'}),swatch('Bar',32,value*2,index===3?'blue':'lavender',index===3?1:0.43,8)],{height:140,gap:4,align:'CENTER',distribution:'MAX'}),
  text('DayLabel',`11/${12+index}`,'small','muted',{width:44,textAlign:'CENTER'})
],{align:'CENTER',gap:8}));
const chart=col('IntakeTrend',[
  row('ChartHeader',[col('ChartTitle',[text('Title','新增工单','body'),text('Period','11 月 12–18 日 · 按日统计','small','muted')],{gap:4,...fill}),badge('Total','合计 260 单')],{...center}),
  row('BarChart',bars,{equalColumns:true,gap:8}),
  rule('ChartSeparator'),text('ChartNote','11 月 15 日为本周峰值：57 单。','small','muted')
],{...material,height:320,gap:12,...fill});

const queue=col('PriorityQueue',[
  row('QueueHeader',[text('Title','优先处理','body','ink',fill),badge('AtRisk','3 单临近超时','red')],{...center}),
  ...[
    ['退款未到账','TK-3048 · 支付售后','剩余 12 分钟'],
    ['企业账号无法登录','TK-3045 · 账号权限','剩余 26 分钟'],
    ['发票抬头需更正','TK-3037 · 财务服务','剩余 41 分钟']
  ].map(([title,meta,time],index)=>col(`Priority${index+1}`,[rule('RowSeparator'),row('Ticket',[col('TicketDetails',[text('Title',title),text('Reference',meta,'small','muted')],{gap:4,...fill}),text('Deadline',time,'small','red')],{gap:8,...center})],{gap:8}))
],{...material,width:360,height:320,gap:16});

const columns=[['TicketId',116],['Subject',undefined],['Channel',124],['Assignee',124],['Status',116],['Updated',100]];
const ticketRows=[
  ['工单号','标题','渠道','负责人','状态','更新时间'],
  ['TK-3051','配送地址修改申请','在线客服','未分配','待分配','14:42'],
  ['TK-3050','无法下载订单收据','邮件','陈晓','处理中','14:37'],
  ['TK-3049','会员权益未生效','在线客服','林安','已解决','14:21'],
  ['TK-3047','账单明细查询','邮件','许宁','处理中','14:06']
].map((line,index)=>row(index?`TicketRow${index}`:'ColumnHeaders',columns.map(([name,width],column)=>text(name,line[column],'small',index?(column===4?'blue':column===1?'ink':'muted'):'muted',width?{width}:fill)),{height:index?40:32,gap:8,...center}));
const table=col('RecentTickets',[
  row('TableTitle',[text('Title','最近工单','body','ink',fill),text('Sort','按更新时间排序','small','muted')],{...center}),
  col('TicketTable',ticketRows.flatMap((item,index)=>index?[rule(`RowRule${index}`),item]:[item]))
],{...material,height:284,gap:16});

const main=col('Dashboard',[header,metrics,row('Operations',[chart,queue],{gap:16}),table,
  row('Footer',[text('Date','2026 年 11 月 18 日 · 上海时间','small','muted'),text('DataSource','示例数据 · 仅供设计评审','small','muted')],{...between})
],{gap:20,...fill});
const root=row('ServiceDesk/Desktop/Overview',[rail,main],{padding:32,gap:24,background:color.canvas,backdrop:[
  {color:color.blue,opacity:0.32},{color:color.lavender,opacity:0.15},{color:color.red,opacity:0.19}
]});
process.stdout.write(JSON.stringify({pageId,width:1440,root,profile:'luigi-default'},null,2)+'\n');
