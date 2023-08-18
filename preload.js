const electron = require('electron');   // electron 桌面集成，用于打开默认浏览器
const axios = require('axios'); // http 通讯
const cheerio = require('cheerio'); // html 解析
const removeMk = require('remove-markdown') // Markdown 文本格式去除

const topTabs = [];   // OI-Wiki 顶部导航标签

class UtoolsListItem {
    constructor(title, description, url, icon) {
        this.title = title;
        this.description = description;
        this.url = url;
        this.icon = icon;
    }
}

function stripHTMLAndEscapes(html) {
    let res = html.replace(/<.*?>/g, '');
    res = res.replace(/\\[a-z]/g, '');
    res = res.replace(/\s*/, ' ');
    return res;
}

/* 去掉 Markdown 格式 */
function stripMarkdownFormat(mk) {
    return removeMk(mk);
}

function processItem(item) {
    let newItem = new Object();
    newItem.title = stripMarkdownFormat(stripHTMLAndEscapes(item.title));
    if (newItem.title.length === 0) {
        newItem.title = '------';
    }
    newItem.highlight = stripMarkdownFormat(stripHTMLAndEscapes(`${(item.highlight || '无简介').concat()}`));
    newItem.url = item.url;
    return newItem;
}

window.exports = {
    "global-search": { // 注意：键对应的是 plugin.json 中的 features.code
        mode: "list",  // 列表模式
        args: {
            // 进入插件应用时调用（可选）
            enter: (action, callbackSetList) => {
                // 如果进入插件应用就要显示列表数据
                    axios.get('https://oi-wiki.org/').then(
                        (response) => {
                            let $mainPage = cheerio.load(response.data);
                            $mainPage('a', 'li[class=md-tabs__item]').each(
                                (i, elem) => {
                                    topTabs.push(new UtoolsListItem(
                                        $(elem).text().trim(),
                                        '简介',
                                        $(elem).attr('href'),
                                        'img/title',
                                    ));
                                }
                            );
                            callbackSetList(topTabs);
                        }
                    ).catch(
                        (error) => {callbackSetList(['error']);}
                    )
            },
            // 子输入框内容变化时被调用 可选 (未设置则无搜索)
            search: (action, searchWord, callbackSetList) => {
                // 获取 OI-Wiki 关键词匹配列表
                if (searchWord.trim().length === 0) {
                    // 清空子输入框后
                    callbackSetList([]);
                    return;
                }
                axios.get(encodeURI(`https://search.oi-wiki.org:8443/?s=${searchWord}`))
                    .then(response => {
                        let matchedList = response.data;  // 关键词匹配列表
                        if (matchedList.length === 0) {
                            callbackSetList([]);
                        }
                        else {
                            // 将原始html字符串转化为普通字符串
                            let presentList = [];
                            matchedList.forEach(item => {
                                let newItem = processItem(item)
                                presentList.push(new UtoolsListItem(
                                    newItem.title,
                                    newItem.highlight,
                                    `https://oi-wiki.org${newItem.url}`,
                                    'img/search.png'
                                ));
                            });
                            // 执行 callbackSetList 显示出来
                            callbackSetList(presentList);
                        }
                    })
                    .catch(err => { callbackSetList([{ title: err.toString() }]) })
            },
            // 用户选择列表中某个条目时被调用
            select: (action, itemData, callbackSetList) => {
                window.utools.hideMainWindow();
                const url = itemData.url;
                window.utools.shellOpenExternal(url);
                window.utools.outPlugin();
            },
            // 子输入框为空时的占位符，默认为字符串"搜索"
            placeholder: "搜索 OI-Wiki 关键词"
        }
    }
}