import React, { useMemo, useEffect } from 'react'
import PropTypes from 'prop-types'
// 单独创建的context
import { ReactReduxContext } from './Context'
import Subscription from '../utils/Subscription'
// 对外提供的Provider组件
// Provider是一个比较简单的组件，主要做了2件事

// 订阅redux的subscribe()事件
// 将Subscription实例传入Context方便子级订阅
function Provider({ store, context, children }) {
  // useMemo仅在store变化时再重新返回
  const contextValue = useMemo(() => {
    const subscription = new Subscription(store)
    // 通知订阅这个subscription的子级刷新
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      // 将此subscription传入context方便子级订阅
      subscription
    }
  }, [store])
  // 缓存上次的state
  const previousState = useMemo(() => store.getState(), [store])

  useEffect(() => {
    const { subscription } = contextValue
    // 在这里是订阅的reudx store的subscribe事件
    subscription.trySubscribe()

    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }
    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = null
    }
  }, [contextValue, previousState])
  // 传入的context或者react-redux自带的
  const Context = context || ReactReduxContext
  // 基于context api来完成跨组件通信的
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

if (process.env.NODE_ENV !== 'production') {
  Provider.propTypes = {
    store: PropTypes.shape({
      subscribe: PropTypes.func.isRequired,
      dispatch: PropTypes.func.isRequired,
      getState: PropTypes.func.isRequired
    }),
    context: PropTypes.object,
    children: PropTypes.any
  }
}

export default Provider
