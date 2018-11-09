/* @flow */
/* globals MessageChannel */

/**
* https://mp.weixin.qq.com/s?__biz=MzA5NzkwNDk3MQ==&mid=2650588380&idx=1&sn=8e27d2783548a824cf7e70ceaef12fc2&chksm=8891d4f8bfe65dee8a06c1564f8ba8dcb65d27cbebe0e747087bd7bda2efdfb0d57689da5d54&mpshare=1&scene=1&srcid=1101iarC1vgq1FPyXaBIcjvP&key=94f77861b07221bdcb7c34a2174454d99da419a2527b766a6da02ff903edc6da9d4ef666226ed40c490b0c82bb0502e65a7a856ec973dd042eac6df74d747b95aee0ec8b40b5d5420cc849a792ebe008&ascene=0&uin=MTc3ODAxNzUyNQ%3D%3D&devicetype=iMac+MacBookPro12%2C1+OSX+OSX+10.12.6+build(16G1510)&version=12020810&nettype=WIFI&lang=zh_CN&fontScale=100&pass_ticket=MfBWGvVvIokUss1j3zj5wh33%2Bjnkkd5Y0Vs%2B18hXNo3gaJ%2BLjKsaW9BXbmz1MECn
* 这篇文章作为next-tick的补充
*/

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIOS, isNative } from './env'

const callbacks = []
// 为false，则表示不需要等待刷新
let pending = false

function flushCallbacks() {
  // callbacks 置为空可以重新使用
  // 之后添加的回调都属于第二个microTask
  pending = false
  const copies = callbacks.slice(0)
  // 此时可以添加下一个microTask
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using both microtasks and (macro) tasks.
// In < 2.4 we used microtasks everywhere, but there are some scenarios where
// microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690) or even between bubbling of the same
// event (#6566). However, using (macro) tasks everywhere also has subtle problems
// when state is changed right before repaint (e.g. #6813, out-in transitions).
// Here we use microtask by default, but expose a way to force (macro) task when
// needed (e.g. in event handlers attached by v-on).
let microTimerFunc
let macroTimerFunc
let useMacroTask = false

// Determine (macro) task defer implementation.
// Technically setImmediate should be the ideal choice, but it's only available
// in IE. The only polyfill that consistently queues the callback after all DOM
// events triggered in the same loop is by using MessageChannel.
/* istanbul ignore if */
if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // setImmediate性能比setTimeout好，会立即插入task
  macroTimerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else if (typeof MessageChannel !== 'undefined' && (
  isNative(MessageChannel) ||
  // PhantomJS
  MessageChannel.toString() === '[object MessageChannelConstructor]'
)) {
  // MessageChannel的两个port中，当其中一个port触发postMessage，则另一端的onmessage注册为task
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = flushCallbacks
  macroTimerFunc = () => {
    port.postMessage(1)
  }
} else {
  /* istanbul ignore next */
  // 最后的方案，使用setTimeout
  macroTimerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// Determine microtask defer implementation.
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  microTimerFunc = () => {
    p.then(flushCallbacks)
    // in problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
} else {
  // fallback to macro
  microTimerFunc = macroTimerFunc
}

/**
 * Wrap a function so that if any code inside triggers state change,
 * the changes are queued using a (macro) task instead of a microtask.
 */
export function withMacroTask (fn: Function): Function {
  return fn._withTask || (fn._withTask = function () {
    useMacroTask = true
    const res = fn.apply(null, arguments)
    useMacroTask = false
    return res
  })
}

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  // 如果为false，则直接注册microTask
  // 如果为true，则是在执行
  if (!pending) {
    pending = true
    if (useMacroTask) {
      macroTimerFunc()
    } else {
      microTimerFunc()
    }
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
