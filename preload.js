const electron = require('electron');   // electron 桌面集成，用于打开默认浏览器
const axios = require('axios'); // http 通讯
const cheerio = require('cheerio'); // html 解析
const removeMk = require('remove-markdown') // Markdown 文本格式去除

const topTabs = [];   // OI-Wiki 顶部导航标签
const siteUrl = 'https://oi-wiki.org/';
const logger = window.utools.showNotification;

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

window.exports = {
    "global-search": { // 注意：键对应的是 plugin.json 中的 features.code
        mode: "list",  // 列表模式
        args: {
            // 进入插件应用时调用（可选）
            enter: async (action, callbackSetList) => {
                // 如果进入插件应用就要显示列表数据
                try {
                    let res = await axios.get(siteUrl)
                    let $ = cheerio.load(res.data);
                    $('li.md-tabs__item > a').each(
                        (i, elem) => {
                            let tabText = $(elem).text().trim();
                            topTabs[i] = new UtoolsListItem(
                                tabText,
                                '查看目录',
                                slashUrl(siteUrl + $(elem).attr('href')),
                                'img/title.png',
                                1
                            );
                        }
                    );
                    if (topTabs.length !== 0) {
                        callbackSetList(topTabs);
                    }
                } catch (error) {
                    window.utools.showNotification(error);
                }
            },
            // 子输入框内容变化时被调用 可选 (未设置则无搜索)
            search: async (action, searchWord, callbackSetList) => {
                // 获取 OI-Wiki 关键词匹配列表
                if (searchWord.trim().length === 0) {
                    // 清空子输入框后
                    callbackSetList(topTabs);
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
                                0
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
                    case 0:
                        window.utools.hideMainWindow();
                        const url = itemData.url;
                        window.utools.shellOpenExternal(url);
                        window.utools.outPlugin();
                        break;
                    case 1:
                        callbackSetList([]);
                        try {
                            let res = await axios.get(itemData.url);
                            let $ = cheerio.load(res.data);
                            let navList = [];
                            $('li.md-nav__item--active > nav[data-md-level="1"] > ul > li.md-nav__item').each(
                                (i, elem) => {
                                    navList[i] = new UtoolsListItem();
                                    let $nav = $(elem).find('nav[data-md-level="2"]');
                                    if ($nav.length !== 0) {
                                        // 包含二级菜单
                                        navList[i].title = $nav.children('label').eq(0).text();
                                        navList[i].description = '展开查看';
                                        navList[i].type = 2
                                        navList[i].icon = 'img/more.png'
                                        let subList = [];
                                        $(elem).find('a.md-nav__link').each(
                                            (j, el) => {
                                                subList[j] = new UtoolsListItem(
                                                    $(el).text(),
                                                    navList[i].title,
                                                    slashUrl(itemData.url + $(el).attr('href')),
                                                    'img/navigation.png',
                                                    0
                                                )
                                            }
                                        )
                                        navList[i].payload = subList;
                                    } else {
                                        let $a = $(elem).children('a.md-nav__link');
                                        navList[i].title = $a.text();
                                        navList[i].description = itemData.title;
                                        navList[i].url = slashUrl(itemData.url + $a.attr('href'));
                                        navList[i].type = 0;
                                        navList[i].icon = 'img/navigation.png';
                                    }
                                }
                            )
                            callbackSetList(navList);
                        } catch (error) {
                            logger(error);
                        }
                        break;
                    case 2:
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