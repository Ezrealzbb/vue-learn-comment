/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }

  // 将 Vue.config 设置为只读
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // 内部方法，不推荐使用
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }


  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 添加全局的配置，增加components、filters、directives
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  // 设置内置的组件 KeepAlive、Transition、TransitionGroup
  extend(Vue.options.components, builtInComponents)

  // 此时Vue.options的内容、
  // Vue.options = {
  //   components: {
  //     'KeepAlive': component
  //   },
  //   directives: Object.create(null),
  //   filters: Object.create(null),
  //   _base: Vue
  // }


  // 添加 Vue.use
  // 用一个数组存放着插件，如果数组中已经存在这个插件，则返回
  // 否则调用plugin.install()或者plugin()
  // 将当前实例，其他Vue.use的第二~N的参数传递给插件初始化方法
  initUse(Vue)

  // 添加Vue.mixin
  // 添加全局的配置
  initMixin(Vue)

  // 添加Vue.extend 方法
  initExtend(Vue)

  // 添加Vue.components Vue.filters Vue.directives 方法
  // 将添加的函数或者配置对象，缓存到Vue.options.components(filters/directive里)
  initAssetRegisters(Vue)
}
