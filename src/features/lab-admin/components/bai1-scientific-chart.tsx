import {useId} from 'react';
import type {Bai1Chart} from '../bai1-dashboard';
const number=(v:number)=>new Intl.NumberFormat('vi-VN',{maximumSignificantDigits:4}).format(v);
export function Bai1ScientificChart({model}:{model:Bai1Chart}){
 const titleId=useId();if(!model.points.length&&!model.annotations.length)return <figure className="b1-chart"><figcaption>{model.title}</figcaption><p className="b1-empty">{model.note||'Chưa có số đo đã lưu để vẽ biểu đồ.'}</p></figure>;
 const width=580,height=250,left=64,right=24,top=24,bottom=55,allX=[...model.points.map(p=>p.x),...model.annotations.map(p=>p.x)],minX=model.categories?-.4:Math.min(0,...allX),maxX=model.categories?model.categories.length-.6:Math.max(1,...allX),minY=Math.min(0,...model.points.map(p=>p.y)),maxY=Math.max(.00001,...model.points.map(p=>p.y))*1.16;
 const x=(v:number)=>left+(v-minX)/(maxX-minX||1)*(width-left-right),y=(v:number)=>height-bottom-(v-minY)/(maxY-minY||1)*(height-top-bottom),ticks=[0,.25,.5,.75,1],xTicks=model.categories?.map((label,i)=>({value:i,label}))||[minX,(maxX-minX)/2+minX,maxX].map(value=>({value,label:number(value)}));
 return <figure className="b1-chart"><figcaption id={titleId}>{model.title}</figcaption><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
  {ticks.map(t=>{const value=minY+(maxY-minY)*t;return <g key={t}><line x1={left} y1={y(value)} x2={width-right} y2={y(value)} className="b1-gridline"/><text x={left-9} y={y(value)+4} textAnchor="end">{number(value)}</text></g>;})}
  <line x1={left} y1={height-bottom} x2={width-right} y2={height-bottom} className="b1-axis"/>{xTicks.map(t=><text key={t.value} x={x(t.value)} y={height-bottom+21} textAnchor="middle">{t.label}</text>)}
  <text x={left} y={14}>{model.yLabel}</text><text x={width-right} y={height-7} textAnchor="end">{model.xLabel}</text>
  {model.trace&&<polyline points={model.points.map(p=>`${x(p.x)},${y(p.y)}`).join(' ')} className="b1-trace"/>}
  {model.segments.map(([a,b],i)=><line key={i} x1={x(a.x)} y1={y(a.y)} x2={x(b.x)} y2={y(b.y)} className="b1-trace"/>)}
  {!model.trace&&model.points.map((p,i)=><circle key={i} cx={x(p.x)} cy={y(p.y)} r={5} className={p.series==='REV'?'b1-point violet':'b1-point'} tabIndex={0} aria-label={`${p.label}: ${number(p.y)} ${model.unit}`}><title>{p.label}: {number(p.y)} {model.unit}</title></circle>)}
  {model.annotations.map((p,i)=><text key={i} x={x(p.x)} y={top+18+(i%2)*18} textAnchor="middle" className="b1-ol">{p.label}</text>)}
 </svg>{model.categories&&model.title.includes('Phân cực')&&<p className="b1-legend"><span>● Thuận</span><span>● Ngược</span><span>OL: không có điểm số</span></p>}{model.note&&<p className="b1-chart-note">{model.note}</p>}</figure>;
}
