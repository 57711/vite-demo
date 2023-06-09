const http = require('http')
// const url = require('url')
const path = require('path')
const querystring = require('querystring')

const compilerSfc = require('@vue/compiler-sfc');
const compilerDom = require('@vue/compiler-dom');
const fs = require('fs');

const { init, parse } = require('es-module-lexer');
const MagicString = require('magic-string');


const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url, `http://${req.headers.host}`)
    let pathName = reqPath.pathname
    if (pathName == '/') {
        pathName = '/index.html'
    }
    let extName = path.extname(pathName);
    let extType = '';
    switch (extName) {
        case '.html':
            extType = 'text/html';
            break;
        case '.js':
            extType = 'application/javascript';
            break;
        case '.css':
            extType = 'text/css';
            break;
        case '.ico':
            extType = 'image/x-icon';
            break;
        case '.vue':
            extType = 'application/javascript';
            break;
        default:
            extType = 'text/html';
    }
    if (/^\/@modules\//.test(pathName)) {
        resolveNodeModules(pathName, res);
    } else {
        resolveModules(pathName, extName, extType, res, reqPath);
    }
})
server.listen(9090)

function resolveModules(pathName, extName, extType, res, reqPath) {
    fs.readFile(`.${pathName}`, 'utf-8', (err, data) => {
        if (err) {
            throw err;
        }
        res.writeHead(200, { 'Content-Type': `${extType}; charset=utf-8` })

        if (extName === '.js') {
            // 对后缀为.js的文件处理
            // rewriteImports函数作用将替换import引入第三方包的路径, 一会我们实现这个函数
            const r = rewriteImports(data);
            res.write(r);
        } else if (extName === '.vue') {
            // 对后缀为.vue的文件处理(即SFC)
            // 解析出请求url的参数对象
            const query = querystring.parse(reqPath.search.slice(1));
            // 通过@vue/compiler-sfc库把sfc解析成json数据
            const ret = compilerSfc.parse(data);
            const { descriptor } = ret;
            console.log(query.type)
            if (!query.type) {
                // 解析出sfc文件script部分
                const scriptBlock = descriptor.script.content;
                // 在sfc文件中我们也可能使用import引入文件所以需要rewriteImports函数把里面的路径进行替换
                const replacedSource = scriptBlock.replace('export default', 'const __script = ')
                const newScriptBlock = rewriteImports(replacedSource);

                // let templateBlock = descriptor.template.content;
                // let compilerTemplateBlockRender = compileTemplate(templateBlock);
                // compilerTemplateBlockRender = compilerTemplateBlockRender.replace('export', 'const __render = ');

                // 将替换好的js部分和动态引入render函数（template编译而成）组合再一起然后返回到浏览器
                const newRet = `
                    ${newScriptBlock}
                    import { render as __render } from '.${pathName}?type=template'
                    // import '.${pathName}?type=style'
                    __script.render = __render
                    export default __script
                `;

                // // render template and script together
                // const newRet = `
                //     ${newScriptBlock}
                //     ${compilerTemplateBlockRender}
                //     __script.render = __render
                //     export default __script
                // `;
                res.write(newRet);
            } else if (query.type == 'template') {
                // 浏览器再次解析到 `import { render as __render } from './App.vue?type=template'`会加载render函数
                // 解析出vue文件通过@vue/compiler-dom库将template部分变为render函数
                const templateBlock = descriptor.template.content;
                const compilerTemplateBlockRender = compileTemplate(templateBlock);
                res.write(compilerTemplateBlockRender);
            } else if (query.type == 'style'){
                const styleBlock = descriptor.styles[0]?.content
                console.log(descriptor, styleBlock)
                res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
                res.write(styleBlock)
            }
        } else {
            // 对其他后缀比如.html、ico的文件处理
            // 不需要做任何处理直接返回
            res.write(data);
        }
        res.end();
    })
}

function compileTemplate (templateBlock){
    const compiledCode = compilerDom.compile(templateBlock, {mode: 'module'}).code
    return rewriteImports(compiledCode)
}

function resolveNodeModules(pathName, res) {
    // 获取 `/@modules/vue` 中的vue   
    const id = pathName.replace(/\/@modules\//, '');
    // 获取第三方包的绝对地址
    let absolutePath = path.resolve(__dirname, 'node_modules', id);
    // 获取第三方包的package.json的module字段解析出esm的包地址
    const modulePath = require(absolutePath + '/package.json').module;
    const esmPath = path.resolve(absolutePath, modulePath);
    // 读取esm模块的js内容
    fs.readFile(esmPath, 'utf-8', (err, data) => {
        if (err) {
            throw err;
        }
        res.writeHead(200, {
            'Content-Type': `application/javascript; charset=utf-8`,
        })
        // 使用rewriteImports函数替换资源中引入的第三方包的路径
        const r = rewriteImports(data);
        res.write(r);
        res.end();
    });
}



// es-module-lexer 参数解析
// n 表示模块的名称
// s 表示模块名称在导入语句中的开始位置
// e 表示模块名称在导入语句中的结束位置
// ss 表示导入语句在源代码中的开始位置
// se 表示导入语句在源代码中的结束位置
// d 表示导入语句是否为动态导入，如果是则为对应的开始位置，否则默认为 -1
function rewriteImports(soure) {
    const [imports, exports] = parse(soure);
    const magicString = new MagicString(soure);
    if (imports.length) {
        for (let i = 0; i < imports.length; i++) {
            const { s, e } = imports[i];
            let id = soure.substring(s, e);
            if (/^[^\/\.]/.test(id)) {
                // id = `/@modules/${id}`;
                // 修改路径增加 /@modules 前缀
                // magicString.overwrite(s, e, id);
                magicString.overwrite(s, e, `/@modules/${id}`);
            }
        }
        return magicString.toString();
    } else return soure
}
