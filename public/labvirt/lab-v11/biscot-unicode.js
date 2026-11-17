const cp1252={0x20AC:128,0x201A:130,0x0192:131,0x201E:132,0x2026:133,0x2020:134,0x2021:135,0x02C6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017D:142,0x2018:145,0x2019:146,0x201C:147,0x201D:148,0x2022:149,0x2013:150,0x2014:151,0x02DC:152,0x2122:153,0x0161:154,0x203A:155,0x0153:156,0x017E:158,0x0178:159};
const suspicious=/(?:Ã[\u0080-\u02ff]|Â[\u0080-\u02ff]|Ä[\u0080-\u02ff\u2018-\u201d]|á[º»]|â[€\u0080-\u00ff])/u;
const decoder=new TextDecoder('utf-8',{fatal:true});
/** Decode only byte sequences that form valid UTF-8 and reduce mojibake; preserve proper Unicode. */
export function fixBrokenVietnamese(value){
  if(typeof value!=='string')return value;
  return value.split(/([ \t\r\n]+)/u).map(token=>{
    for(let pass=0;pass<3&&suspicious.test(token);pass++){
      const bytes=[];
      for(const char of token){const code=char.codePointAt(0);if(code<=255)bytes.push(code);else if(Object.hasOwn(cp1252,code))bytes.push(cp1252[code]);else return token;}
      try{const fixed=decoder.decode(new Uint8Array(bytes));if(fixed===token||fixed.includes('\uFFFD'))break;token=fixed;}catch{break;}
    }
    return token;
  }).join('').normalize('NFC');
}
