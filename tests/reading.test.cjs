const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context=vm.createContext({window:{}});
vm.runInContext(script.slice(0,script.indexOf('function prepareText'))+'\nglobalThis.api={norm,advanceReading,TEXTS};',context);
const {norm,advanceReading,TEXTS}=context.api;
const empty=()=>({index:0,buffer:''});
const tokenize=text=>text.split(/\s+/).map(norm).filter(Boolean);

test('all nine passages complete, including character-by-character input',()=>{
  for(const passage of Object.values(TEXTS).flat()){
    const list=tokenize(passage);
    assert.equal(advanceReading(empty(),passage,list).index,list.length);
    let state=empty();
    for(const char of norm(passage))state=advanceReading(state,char,list);
    assert.equal(state.index,list.length);
    assert.ok(advanceReading(empty(),list.slice(0,Math.floor(list.length*.8)).join(''),list).index<list.length);
  }
});

test('a recognition typo near 30% does not advance highlights by inference',()=>{
  for(const passage of Object.values(TEXTS).flat()){
    const list=tokenize(passage);
    let position=Math.floor(list.length*.3);
    while(position<list.length-2&&(list[position].length<3||list.slice(position+1,position+3).join('').length<4||list.slice(position+1,position+3).join('').includes(list[position])))position++;
    assert.ok(position<list.length-2);
    const speech=list.slice();
    speech[position]='쀍'+speech[position].slice(1);
    assert.equal(advanceReading(empty(),speech.slice(0,position+3).join(''),list).index,position);
  }
});

test('split exact speech events advance without waiting for following context',()=>{
  const list=['작은새가','나뭇가지에','앉아서','노래했어요'];
  let state=advanceReading(empty(),'작은',list);
  assert.equal(state.index,0);
  state=advanceReading(state,'새가',list);
  assert.equal(state.index,1);
  state=advanceReading(state,'나뭇가지에 앉아서 노래했어요',list);
  assert.equal(state.index,list.length);
});

test('inserted or missing syllables do not move the confirmed position',()=>{
  const list=['나뭇가지에','앉아서','조용하게','노래했어요'];
  for(const first of ['나무가지에','나뭇가지위에']){
    assert.equal(advanceReading(empty(),first+'앉아서조용하게노래했어요',list).index,0);
  }
});

test('omitted words and sentences cannot be replaced by later text',()=>{
  const list=['아침에는','작은새가','나뭇가지에','앉아서','노래했어요'];
  assert.equal(advanceReading(empty(),'아침에는 나뭇가지에 앉아서 노래했어요',list).index,1);
  assert.equal(advanceReading(empty(),'아침에는',list).index,1);
  assert.equal(advanceReading(empty(),'노래했어요',list).index,0);
});

test('omitting a section near 30% never completes any of the nine passages',()=>{
  for(const passage of Object.values(TEXTS).flat()){
    const list=tokenize(passage),position=Math.floor(list.length*.3);
    const speech=[...list.slice(0,position),...list.slice(position+5)].join('');
    assert.ok(advanceReading(empty(),speech,list).index<list.length);
  }
});

test('last word and ambiguous short words still require exact recognition',()=>{
  const list=['작은새가','숲','속에서','노래했어요'];
  assert.equal(advanceReading(empty(),'작은새가 속에서 노래했어요',list).index,1);
  assert.equal(advanceReading(empty(),'작은새가 숲 속에서 노레했어요',list).index,3);
});

test('short recognition errors are not inferred from later words',()=>{
  const list=['윤우','작은문을','열고서','천천히','들어갔어요'];
  assert.equal(advanceReading(empty(),'연우작은문을열고서천천히들어갔어요',list).index,0);
  assert.equal(advanceReading(empty(),'작은문을열고서천천히들어갔어요',list).index,0);
  const sound=['쿵','문이닫히자','참았던숨을','내뱉었어요'];
  assert.equal(advanceReading(empty(),'콩문이닫히자참았던숨을내뱉었어요',sound).index,0);
  assert.equal(advanceReading(empty(),'문이닫히자참았던숨을내뱉었어요',sound).index,0);
});

test('re-reading the remaining words after a stall recovers',()=>{
  const list=['아침에는','작은새가','나뭇가지에','노래했어요'];
  let state=advanceReading(empty(),'아침에는 전혀다른말 나뭇가지에 노래했어요',list);
  assert.equal(state.index,1);
  state=advanceReading(state,'작은새가 나뭇가지에 노래했어요',list);
  assert.equal(state.index,list.length);
});
