import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

// 原型链添加Vue.prototype._init方法
initMixin(Vue)

// 原型链添加$data $prop $watch 等属性和方法
stateMixin(Vue)

// 原型链添加事件方法，$on $emit等
eventsMixin(Vue)

// 原型添加$forceUpdate，$destroy等
lifecycleMixin(Vue)

// 原型添加$nextTick，_render等
renderMixin(Vue)

export default Vue
