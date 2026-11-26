import json
page=open('index.html').read()
t=open('worker.template.js').read()
open('worker.js','w').write(t.replace('__PAGE__', json.dumps(page)))
print('worker.js built', len(page))
