
# 源码分析

## 文件结构

``` bash
/Users/liufang/openSource/FunnyLiu/react-redux
├── src
|  ├── alternate-renderers.js
|  ├── components
|  |  ├── Context.js
|  |  ├── Provider.js - Provider组件实现，基于context api完成store的注入
|  |  └── connectAdvanced.js - connect调用的高阶组件
|  ├── connect
|  |  ├── connect.js - connect方法入口
|  |  ├── mapDispatchToProps.js
|  |  ├── mapStateToProps.js
|  |  ├── mergeProps.js
|  |  ├── selectorFactory.js - 处理mergeprops的核心逻辑处
|  |  ├── verifySubselectors.js
|  |  └── wrapMapToProps.js
|  ├── hooks
|  |  ├── useDispatch.js
|  |  ├── useReduxContext.js
|  |  ├── useSelector.js
|  |  └── useStore.js
|  ├── index.js
|  └── utils
|     ├── Subscription.js - 主要就是创建一个既有监听功能又有订阅功能的对象
|     ├── batch.js
|     ├── isPlainObject.js
|     ├── reactBatchedUpdates.js
|     ├── reactBatchedUpdates.native.js
|     ├── shallowEqual.js
|     ├── useIsomorphicLayoutEffect.js
|     ├── useIsomorphicLayoutEffect.native.js
|     ├── verifyPlainObject.js
|     ├── warning.js
|     └── wrapActionCreators.js

directory: 45 file: 137

ignored: directory (1)

```

## 外部模块依赖

![img](./outer.svg)

## 内部模块依赖

![img](./inner.svg)

## 知识点

### 基本用法


React-Redux 将所有组件分成两大类：UI 组件（presentational component）和容器组件（container component）。

UI 组件有以下几个特征。

- 只负责 UI 的呈现，不带有任何业务逻辑

- 没有状态（即不使用this.state这个变量）

- 所有数据都由参数（this.props）提供

- 不使用任何 Redux 的 API

容器组件的特征恰恰相反。

- 负责管理数据和业务逻辑，不负责 UI 的呈现
- 带有内部状态
- 使用 Redux 的 API
总之，只要记住一句话就可以了：UI 组件负责 UI 的呈现，容器组件负责管理数据和逻辑。



一般会提供两个函数，Provider和connect。

connect方法，用于从 UI 组件生成容器组件，connect方法接受两个参数：mapStateToProps和mapDispatchToProps。它们定义了 UI 组件的业务逻辑。前者负责输入逻辑，即将state映射到 UI 组件的参数（props），后者负责输出逻辑，即将用户对 UI 组件的操作映射成 Action。

``` js
import React from 'react';
import agent from '../agent';
import { connect } from 'react-redux';
import { SET_PAGE } from '../constants/actionTypes';

const mapDispatchToProps = dispatch => ({
  onSetPage: (page, payload) =>
    dispatch({ type: SET_PAGE, page, payload })
});

const ListPagination = props => {
  if (props.articlesCount <= 10) {
    return null;
  }

  const range = [];
  for (let i = 0; i < Math.ceil(props.articlesCount / 10); ++i) {
    range.push(i);
  }

  const setPage = page => {
    if(props.pager) {
      props.onSetPage(page, props.pager(page));
    }else {
      props.onSetPage(page, agent.Articles.all(page))
    }
  };

  return (
    <nav>
      <ul className="pagination">

        {
          range.map(v => {
            const isCurrent = v === props.currentPage;
            const onClick = ev => {
              ev.preventDefault();
              setPage(v);
            };
            return (
              <li
                className={ isCurrent ? 'page-item active' : 'page-item' }
                onClick={onClick}
                key={v.toString()}>

                <a className="page-link" href="">{v + 1}</a>

              </li>
            );
          })
        }

      </ul>
    </nav>
  );
};

export default connect(() => ({}), mapDispatchToProps)(ListPagination);

```

connect方法生成容器组件以后，需要让容器组件拿到state对象，才能生成 UI 组件的参数。

一种解决方法是将state对象作为参数，传入容器组件。但是，这样做比较麻烦，尤其是容器组件可能在很深的层级，一级级将state传下去就很麻烦。

React-Redux 提供Provider组件，可以让容器组件拿到state，Provider在根组件外面包了一层，这样一来，App的所有子组件就默认都可以拿到state了。

它的原理是React组件的context属性

``` js
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import React from 'react';
import { store, history} from './store';

import { Route, Switch } from 'react-router-dom';
import { ConnectedRouter } from 'react-router-redux';

import App from './components/App';

ReactDOM.render((
  <Provider store={store}>
    <ConnectedRouter history={history}>
      <Switch>
        <Route path="/" component={App} />
      </Switch>
    </ConnectedRouter>
  </Provider>

), document.getElementById('root'));

```

### 工作流程：

<img src="https://raw.githubusercontent.com/brizer/graph-bed/master/img/20210301150309.png"/>



Provider: Provider的作用是从最外部封装了整个应用，并向connect模块传递store

connect: 负责连接React和Redux

  - 获取state: connect通过context获取Provider中的store，通过store.getState()获取整个store tree 上所有state

  - 包装原组件: 将state和action通过props的方式传入到原组件内部wrapWithConnect返回一个ReactComponent对象Connect，Connect重新render外部传入的原组件WrappedComponent，并把connect中传入的mapStateToProps, mapDispatchToProps与组件上原有的props合并后，通过属性的方式传给WrappedComponent

  - 监听store tree变化: connect缓存了store tree中state的状态,通过当前state状态和变更前state状态进行比较,从而确定是否调用this.setState()方法触发Connect及其子组件的重新渲染



### Provider组件

其核心基于React的context来挂载store，用于提供给所有经过connect后的容器ui来使用。

其主要做了2件事

- 订阅redux的subscribe()事件
- 将Subscription实例传入Context方便子级订阅

``` js
// 单独创建的context
import { ReactReduxContext } from './Context'
import Subscription from '../utils/Subscription'
// 对外提供的Provider组件
function Provider({ store, context, children }) {
  const contextValue = useMemo(() => {
    const subscription = new Subscription(store)
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      subscription
    }
  }, [store])

  const previousState = useMemo(() => store.getState(), [store])
  // ...

  const Context = context || ReactReduxContext
  // 基于context api来完成跨组件通信的
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

```


### connect

connect用法：

``` js
//映射state
const mapStateToProps = state => ({
  todos: getVisibleTodos(state.todos, state.visibilityFilter)
})
//映射action
const mapDispatchToProps = dispatch => ({
    onTodoClick: id => dispatch(toggleTodo(id))
})

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(TodoList)
```

将state和dispatch通过props的形式挂载到TodoList组件上。

其真实返回的组件定义位于connectAdvanced.js文件中的 ConnectFunction 方法里。

``` js
    // 这个就是connect后生成的新组件
    function ConnectFunction(props) {
      // ...
      const ContextToUse = useMemo(() => {
        return propsContext &&
          propsContext.Consumer &&
          isContextConsumer(<propsContext.Consumer />)
          ? propsContext
          : Context
      }, [propsContext, Context])
      // 拿到contextValue
      const contextValue = useContext(ContextToUse)
      //...
      const renderedWrappedComponent = useMemo(
        () => (
          <WrappedComponent
            {...actualChildProps}
            ref={reactReduxForwardedRef}
          />
        ),
        [reactReduxForwardedRef, WrappedComponent, actualChildProps]
      )
      const renderedChild = useMemo(() => {
        if (shouldHandleStateChanges) {
          return (
            <ContextToUse.Provider value={overriddenContextValue}>
              {renderedWrappedComponent}
            </ContextToUse.Provider>
          )
        }
        return renderedWrappedComponent
      }, [ContextToUse, renderedWrappedComponent, overriddenContextValue])

      return renderedChild
    }
    // 通过useMemo优化
    const Connect = pure ? React.memo(ConnectFunction) : ConnectFunction
    // 其包裹组件为真正传入connect函数的组件
    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName

    if (forwardRef) {
      const forwarded = React.forwardRef(function forwardConnectRef(
        props,
        ref
      ) {
        return <Connect {...props} reactReduxForwardedRef={ref} />
      })

      forwarded.displayName = displayName
      forwarded.WrappedComponent = WrappedComponent
      return hoistStatics(forwarded, WrappedComponent)
    }
    //通过hoist-non-react-statics将传入的组件WrappedComponent上的属性赋予到新组件Connect上
    return hoistStatics(Connect, WrappedComponent)

```

底层基于hoist-non-react-statics将connect方法传入的组件和包装组件进行静态方法合并。



-----





  

React Redux
=========================

Official React bindings for [Redux](https://github.com/reduxjs/redux).  
Performant and flexible.

[![build status](https://img.shields.io/travis/reduxjs/react-redux/master.svg?style=flat-square)](https://travis-ci.org/reduxjs/react-redux) [![npm version](https://img.shields.io/npm/v/react-redux.svg?style=flat-square)](https://www.npmjs.com/package/react-redux)
[![npm downloads](https://img.shields.io/npm/dm/react-redux.svg?style=flat-square)](https://www.npmjs.com/package/react-redux)
[![redux channel on discord](https://img.shields.io/badge/discord-redux@reactiflux-61DAFB.svg?style=flat-square)](http://www.reactiflux.com)




## Installation

### Using Create React App

The recommended way to start new apps with React Redux is by using the [official Redux+JS template](https://github.com/reduxjs/cra-template-redux) for [Create React App](https://github.com/facebook/create-react-app), which takes advantage of [Redux Toolkit](https://redux-toolkit.js.org/).

```sh
npx create-react-app my-app --template redux
```

### An Existing React App

React Redux 7.1 requires **React 16.8.3 or later.**

To use React Redux with your React app, install it as a dependency:

```bash
# If you use npm:
npm install react-redux

# Or if you use Yarn:
yarn add react-redux
```

You'll also need to [install Redux](https://redux.js.org/introduction/installation) and [set up a Redux store](https://redux.js.org/recipes/configuring-your-store/) in your app.

This assumes that you’re using [npm](http://npmjs.com/) package manager 
with a module bundler like [Webpack](https://webpack.js.org/) or 
[Browserify](http://browserify.org/) to consume [CommonJS 
modules](https://webpack.js.org/api/module-methods/#commonjs).

If you don’t yet use [npm](http://npmjs.com/) or a modern module bundler, and would rather prefer a single-file [UMD](https://github.com/umdjs/umd) build that makes `ReactRedux` available as a global object, you can grab a pre-built version from [cdnjs](https://cdnjs.com/libraries/react-redux). We *don’t* recommend this approach for any serious application, as most of the libraries complementary to Redux are only available on [npm](http://npmjs.com/).

## React Native

As of React Native 0.18, React Redux 5.x should work with React Native. If you have any issues with React Redux 5.x on React Native, run `npm ls react` and make sure you don’t have a duplicate React installation in your `node_modules`. We recommend that you use `npm@3.x` which is better at avoiding these kinds of issues.


## Documentation

The React Redux docs are now published at **https://react-redux.js.org** .

We're currently expanding and rewriting our docs content - check back soon for more updates!

## How Does It Work?

We do a deep dive on how React Redux works in [this readthesource episode](https://www.youtube.com/watch?v=VJ38wSFbM3A).  

Also, the post [The History and Implementation of React-Redux](https://blog.isquaredsoftware.com/2018/11/react-redux-history-implementation/) 
explains what it does, how it works, and how the API and implementation have evolved over time.

Enjoy!

## License

[MIT](LICENSE.md)
