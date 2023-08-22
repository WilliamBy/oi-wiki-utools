const electron = require('electron');   // electron 桌面集成，用于打开默认浏览器
const axios = require('axios'); // http 通讯
const cheerio = require('cheerio'); // html 解析
const removeMk = require('remove-markdown') // Markdown 文本格式去除

const siteUrl = 'https://oi-wiki.org/';
var indexArr = [];

class UtoolsListItem {
    constructor(title, description, url, icon, type, payload) {
        this.title = title;
        this.description = description;
        this.url = url;
        this.icon = icon;
        this.type = type;   // number类型，决定选中后的执行逻辑，0-直接跳转到url，1-打开父目录，2-打开子目录
        this.payload = payload;
    }
}

function logger(error) {
    window.utools.showNavigation(error.lineNumber + ": " + error.message);
}

/* 确保url的最后一个字符为正斜 */
function slashUrl(raw) {
    let url = raw;
    if (url.charAt(url.length - 1) !== '/') {
        url = url + '/';
    }
    return url;
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


/**
 * 递归构建导航树
 * $nav: 是要进行递归构建树的 nav 标签的 cheerio 对象
 * $: html 文档 cheerio 对象
 * arr: 用于保存结果（导航树）的数组，前置条件需要保证arr为空
 * parent: 如果为null表示列表中不出现上一级菜单的选项，否则指向上一级导航树 
 */
function navTreeBuilder($nav, $, arr, parent) {
    let navLabel = $nav.attr('aria-label');
    if (parent != null) {
        arr.push(new UtoolsListItem('上级菜单', navLabel, null, 'img/previous.png', 'back', parent));
    }
    let $ls = $nav.children('ul').children('li');
    $ls.each(
        (i, li) => {
            let item = new UtoolsListItem();
            item.description = navLabel;
            let $subNav = $(li).children('nav');
            if ($subNav.length != 0) {
                let subArr = [];
                navTreeBuilder($subNav, $, subArr, arr);
                item.type = 'sub';
                item.title = $subNav.attr('aria-label');
                item.payload = subArr;
                item.icon = 'img/more.png';
            } else {
                let $a = $(li).children('a');
                item.type = 'link';
                item.title = $a.text();
                item.url = slashUrl(siteUrl + $a.attr('href'));
                item.icon = 'img/navigation.png';
            }
            arr.push(item);
        }
    )
}

async function indexWiki(wikiUrl) {
    let navTree = [];
    try {
        let res = await axios.get(wikiUrl)
        let $ = cheerio.load(res.data);
        let $topNav = $('nav[data-md-level="0"]');
        navTreeBuilder($topNav, $, navTree, null);
    } catch (error) {
        logger(error);
    }
    return navTree;
}

window.exports = {
    "global-search": { // 注意：键对应的是 plugin.json 中的 features.code
        mode: "list",  // 列表模式
        args: {
            // 进入插件应用时调用（可选）
            enter: async (action, callbackSetList) => {
                // 如果进入插件应用就要显示列表数据
                indexArr = await indexWiki(siteUrl);
                callbackSetList(indexArr);
            },
            // 子输入框内容变化时被调用 可选 (未设置则无搜索)
            search: async (action, searchWord, callbackSetList) => {
                // 获取 OI-Wiki 关键词匹配列表
                if (searchWord.trim().length === 0) {
                    // 清空子输入框后
                    callbackSetList(indexArr);
                    return;
                }
                try {
                    let res = await axios.get(encodeURI(`https://search.oi-wiki.org:8443/?s=${searchWord}`))
                    let matchedList = res.data;  // 关键词匹配列表
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
                                slashUrl(siteUrl + newItem.url),
                                'img/search.png',
                                'link'
                            ));
                        });
                        // 执行 callbackSetList 显示出来
                        callbackSetList(presentList);
                    }

                } catch (err) { logger(err) }  
            },
            // 用户选择列表中某个条目时被调用
            select: async (action, itemData, callbackSetList) => {
                switch (itemData.type) {
                    case 'link':
                        window.utools.hideMainWindow();
                        const url = itemData.url;
                        window.utools.shellOpenExternal(url);
                        window.utools.outPlugin();
                        break;
                    case 'sub':
                    case 'back':
                        callbackSetList(itemData.payload);
                        break;
                    default:
                        window.utools.outPlugin();
                        break;
                }
            },
            // 子输入框为空时的占位符，默认为字符串"搜索"
            placeholder: "搜索 OI-Wiki 关键词"
        }
    }
}