/** Quote CSV cells without converting user text into a spreadsheet formula. */
export function transistorCsvCell(value){
 const text=String(value??''),number=/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(text);
 const safe=!number&&/^\s*[=+@-]/.test(text)?"'"+text:text;
 return '"'+safe.replace(/"/g,'""')+'"';
}
