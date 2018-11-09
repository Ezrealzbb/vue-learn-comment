/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))

    // 拿个数组存放已经安装的插件，如果已经安装过，就不执行install过程了
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 执行安装方法，或者执行方法本身，初始化插件
    // 插件是有vue属性的
    const args = toArray(arguments, 1)
    args.unshift(this)
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin)
    return this
  }
}
