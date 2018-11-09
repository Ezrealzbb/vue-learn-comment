/* @flow */

import { mergeOptions } from '../util/index'

// this.options应该是每个vue组件初始化前的默认配置，也是全局的
// 当vue组件初始化时，将传入的options和全局的options一起merge
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
