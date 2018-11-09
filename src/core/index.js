import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

initGlobalAPI(Vue)

// 检测是否是node端渲染，检测window/global对象是否存在，如果是
// 服务端渲染，则设置process.env.VUE_ENV = server
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

// 添加$ssrContext属性
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

// 当前的版本号
Vue.version = '__VERSION__'

export default Vue
