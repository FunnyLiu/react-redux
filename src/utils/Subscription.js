import { getBatch } from './batch'

// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

const nullListeners = { notify() {} }
// 监听集合是一个双向链表
function createListenerCollection() {
  // 也就是React里的unstable_batchedUpdates
  // 来自司徒正美微博：unstable_batchedUpdates会把子组件的forceUpdate干掉，防止组件在一个批量更新中重新渲染两次
  const batch = getBatch()
  let first = null
  let last = null

  return {
    clear() {
      first = null
      last = null
    },
    // 通知订阅者更新
    notify() {
      batch(() => {
        let listener = first
        while (listener) {
          // 这个callback的本质就是让组件本身forceUpdate
          listener.callback()
          listener = listener.next
        }
      })
    },

    get() {
      let listeners = []
      let listener = first
      while (listener) {
        listeners.push(listener)
        listener = listener.next
      }
      return listeners
    },
    // 订阅
    subscribe(callback) {
      let isSubscribed = true
      // 把last赋值为新的
      let listener = (last = {
        callback,
        next: null,
        prev: last
      })
      // 如果存在前一个，就把前一个的next指向当前（最后一个）
      if (listener.prev) {
        listener.prev.next = listener
      } else {
        first = listener
      }
      // 返回退订函数
      return function unsubscribe() {
        if (!isSubscribed || first === null) return
        isSubscribed = false

        if (listener.next) {
          listener.next.prev = listener.prev
        } else {
          last = listener.prev
        }
        if (listener.prev) {
          listener.prev.next = listener.next
        } else {
          first = listener.next
        }
      }
    }
  }
}

export default class Subscription {
  constructor(store, parentSub) {
    // redux store
    this.store = store
    // 父级的Subscription实例
    this.parentSub = parentSub
    this.unsubscribe = null
    // 监听者
    this.listeners = nullListeners

    this.handleChangeWrapper = this.handleChangeWrapper.bind(this)
  }
  // 添加嵌套的订阅者
  addNestedSub(listener) {
    // 首先先将当前的Subscription实例绑定到父级
    // 绑定的同时会初始化listeners
    this.trySubscribe()
    return this.listeners.subscribe(listener)
  }
  // 通知子级
  notifyNestedSubs() {
    this.listeners.notify()
  }
  // 当父级Subscription的listeners通知时调用
  handleChangeWrapper() {
    if (this.onStateChange) {
      this.onStateChange()
    }
  }

  isSubscribed() {
    return Boolean(this.unsubscribe)
  }

  trySubscribe() {
    // 不会重复绑定
    if (!this.unsubscribe) {
      this.unsubscribe = this.parentSub
        ? this.parentSub.addNestedSub(this.handleChangeWrapper)
        : // subscribe是redux里的方法，在redux state改变的时候会调用
          this.store.subscribe(this.handleChangeWrapper)
      // 创建新的listeners，每个connect的组件都会有listeners
      this.listeners = createListenerCollection()
    }
  }
  // 退订
  tryUnsubscribe() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
      this.listeners.clear()
      this.listeners = nullListeners
    }
  }
}
