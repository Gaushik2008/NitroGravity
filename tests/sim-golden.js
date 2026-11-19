const s=require('./sim.js');
for(const k in s.EXAMPLES){const b=s.EXAMPLES[k]; const f=s.runHeadless(b); const d=f.d; console.log(k,d.mass.toFixed(0),d.cost,d.twr.toFixed(2),d.power,f.outcome,(f.maxY/1000).toFixed(1)+'km','days',d.days.toFixed(1),'eff',s.efficiency(d));
 console.log('  advice',s.advise(b).map(a=>a.label+' ->'+a.left.join(',')));}
