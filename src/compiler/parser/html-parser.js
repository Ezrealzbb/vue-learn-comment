/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// Regular Expressions for parsing tags and attributes
// 捕获 属性名、= 、属性值
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
// 不包含 ：的XML名称
const ncname = '[a-zA-Z_][\\w\\-\\.]*'

// ((?:[a-zA-Z_][\w\-\.]*\:)?[a-zA-Z_][\w\-\.]*)
const qnameCapture = `((?:${ncname}\\:)?${ncname})`

// startTagOpen匹配开始标签左边，捕获标签名 <div
// /^<((?:[a-zA-Z_][\w\-\.]*\:)?[a-zA-Z_][\w\-\.]*)/
const startTagOpen = new RegExp(`^<${qnameCapture}`)

// startTagClose匹配开始标签右边
const startTagClose = /^\s*(\/?)>/

// endTag 匹配结束标签
// /^<\/((?:[a-zA-Z_][\w\-\.]*\:)?[a-zA-Z_][\w\-\.]*)[^>]*>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)

// 匹配doc头部
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
// 匹配注释
const comment = /^<!\--/

// 条件注释，常用于IE
const conditionalComment = /^<!\[/

// 在老版本的火狐，存在bug，一般匹配出来的g === undefined 
// 老版本火狐则是 ''
let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})

// Special Elements (can contain anything)
// 纯文本标签，里面的内容不做处理
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t'
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g

// #5992
// pre标签和textarea标签会忽略第一个换行符
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// 解码html字符，将 &lt 类似的转为为对应的字符串
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  // 用于保存标签的栈
  const stack = []
  const expectHTML = options.expectHTML
  // 是否是一元标签，比如input
  const isUnaryTag = options.isUnaryTag || no
  // 是否是可以忽略闭合标签的非一元标签，比如 p
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 字符串流的索引位置
  let index = 0
  // 还剩余多少字符串 
  let last,
    // 标签栈顶的tag，表示当前最近的元素
    lastTag
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 如果不是纯文本标签
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // textEnd 保存html中 < 的位置
      let textEnd = html.indexOf('<')

      // 当textEnd为0，则html是以 < 开头
      if (textEnd === 0) {
        // Comment:
        // 注释节点
        if (comment.test(html)) {
          // 寻找注释第一个结束节点
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            // 参见vue config 文档 https://cn.vuejs.org/v2/api/#comments
            // 如果shouldKeepComment = true，则保留且渲染html模板中的注释
            // 默认是false
            if (options.shouldKeepComment) {
              // 解析注释
              options.comment(html.substring(4, commentEnd))
            }
            // 调整游标，向前走3位，出 -->范围
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 如果是条件注释，则保留，不做编译
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            // 游标想前移动2位，出 ]> 范围
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // Doctype头，游标向前移动Doctype头的位数
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 结束标签 </div>
        // ["</div>", "div"]
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          // 游标向前移动
          advance(endTagMatch[0].length)
          // 参数：结束标签名，匹配前的游标，匹配后的游标
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        // 如果有一个 
        // <div v-if="isSuccessed" v-for="item in list"></div>
        // 则startTagMatch 匹配出来的结果应该是：
        // {
        //     tagName: 'div',
        //     attrs: [
        //       [
        //         `v-if="isSuccessed"`,
        //         'v-if',
        //         '=',
        //         'isSuccessed',
        //         undefined,
        //         undefined
        //       ],
        //       [
        //         `v-for="item in list"`,
        //         'v-for',
        //         '=',
        //         'item in list',
        //         undefined,
        //         undefined
        //       ],
        //       start: 0,
        //       unarySlash: undefined,
        //       // 第一个闭合标签左边
        //       end: 46
        //     ],
        // }
        // 解析开始标签，得到解析结果：startTagMatch
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
      }

      // 当字符为“<1<2<3时”
      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          // 当做普通字符串处理
          next = rest.indexOf('<', 1)
          if (next < 0) break
          // 如果后面的字符串还有 < 则游标向前移动，rest继续赋值
          textEnd += next
          rest = html.slice(textEnd)
        }
        // 循环到最后，textEnd作为向前移动的游标，重新设置advance
        text = html.substring(0, textEnd)
        advance(textEnd)
      }

      if (textEnd < 0) {
        text = html
        html = ''
      }

      if (options.chars && text) {
        options.chars(text)
      }
    } else {
      // 栈顶有最近的元素，并且是纯文本标签script style等
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      // 这个正则是用于匹配纯文本标签的后半部分
      // 例如 <textarea>adwdawad</textarea>
      // 此时 lastTag = textarea；html = adwdawad</textarea><div>aaaa</div>
      // reStackedTag 前半部分，匹配全字符集，也就是纯文本内容，后半部分匹配这个纯文本标签的标签名字
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        // 这有3个参数
        // all 是 匹配到的全部字符，基本上等于输入字符
        // text 是 文本内容，对应第一个捕获组的内容
        // endTag 是 结束标签，对应第二个捕获组的内容
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        // 这个是在umd版本中解析html而用，因此要时刻注意浏览器的默认行为
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        // 调用这个方法，告知编译器将次当做纯文本对待
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      // rest是去除了文本标签后的余下的内容，对上文的textarea而言，则 rest = <div>aaaa</div>
      // html.length - rest.length 则表示游标向前移动，跨过这个纯文本标签
      index += html.length - rest.length
      html = rest
      // 处理结束标签，上文的例子看实参是：textarea、textarea的起始位置、textarea的结束位置
      // index: start(x) + plainTextLength(0) + endTagLength(x)
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 如果处理过后，html和没处理前是一样的，则说明html是纯文本，可以直接退出
    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags
  // 清除stack剩余的标签，例如
  // <article><section></section></article><div>
  // 最后还剩余[div]
  // 此时调用，parseEndTag中的pos = 0，stack.length = 0，会被直接清空
  parseEndTag()

  // 移动游标
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  function parseStartTag() {
    // startTagOpen = /^<((?:[a-zA-Z_][\w\-\.]*\:)?[a-zA-Z_][\w\-\.]*)/
    // <div></div>匹配后的结果：
    // ['<div', div]
    const start = html.match(startTagOpen)
    if (start) {
      const match = {
        // div
        tagName: start[1],
        attrs: [],
        // 缓存着这个标签的起始位置
        start: index
      }
      // 游标向前移动 （标签名+1）个位置
      advance(start[0].length)
      let end, attr
      // 如果还没有匹配到开始标签的 ">" ，并且还有属性的情况下
      // 匹配属性，并且将匹配的结果保存至 match
      // 如果标签为<div v-if="item in list"></div>
      // 则 attr = ["v-if="item in list"", "v-if", "=", "item in list", undefined, undefined]
      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
        advance(attr[0].length)
        match.attrs.push(attr)
      }
      // 如果标签为 <br />
      // 则end 为  [" />", "/"]，是一元标签
      // 如果标签为 <div>
      // 则end为 [">"]
      if (end) {
        // match.narySlash = '/'
        // 辅助判断是否是一元标签，特别是自定义组件时：<my-component />
        match.unarySlash = end[1]
        // 向前移动到闭合右标签之后
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      // 当栈顶是 p 标签并且 新的起始标签不是 Phrasing flow ，例如h2，
      // 则自动插入</p>
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      // 如果是可以省略闭合的标签：例如 <p>dadadaw
      // 则自动闭合：<p>dadadaw</p>
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // isUnaryTag 方法由编译器选项传入，判断是否是一个原生的一元标签
    // 如果自定义组件是一元标签，则unarySlash是 '/' 取 true
    // 否则是 undefined 取 false
    const unary = isUnaryTag(tagName) || !!unarySlash

    // 遍历attrs，优化结构
    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
      if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
        if (args[3] === '') { delete args[3] }
        if (args[4] === '') { delete args[4] }
        if (args[5] === '') { delete args[5] }
      }
      const value = args[3] || args[4] || args[5] || ''
      // 解决属性名换行和tab时，在浏览器下会发生 &#10、&#9 的转义，因此要做兼容处理
      // chrome中a标签的href 有此行为
      // IE中所有属性都有此行为
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
    }

    // 如果不是可以忽略闭合的一元标签，则将标签压入栈内
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
      lastTag = tagName
    }

    // 添加开始标签
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // parseEndTag('div', startIndex, endIndex)
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
    }

    // Find the closest opened tag of the same type
    // 寻找开始标签在stack中的位置
    if (tagName) {
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 当只写了闭合标签，且之前没有写开始标签时 pos = -1
      // 当只写了开始标签，pos = 0，先警告同时自动闭合
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`
          )
        }
        // 闭合未闭合的标签
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // 如果 中间有存在没有匹配的tag，则直接删除
      // Remove the open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      // 当pos = -1，且结束标签是</br>时，将其解析为<br />
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
       // 当pos = -1，且结束标签是</p>时，将其解析为<p></p>
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
