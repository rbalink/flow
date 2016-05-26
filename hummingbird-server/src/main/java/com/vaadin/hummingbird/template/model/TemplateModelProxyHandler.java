/*
 * Copyright 2000-2016 Vaadin Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
package com.vaadin.hummingbird.template.model;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Objects;

import com.vaadin.hummingbird.StateNode;

/**
 * Invocation handler for {@link TemplateModel} proxy objects.
 *
 * @author Vaadin Ltd
 */
public class TemplateModelProxyHandler implements InvocationHandler {

    private final StateNode stateNode;

    protected TemplateModelProxyHandler(StateNode stateNode) {
        this.stateNode = stateNode;
    }

    /**
     * Creates a proxy object for the given {@link TemplateModel} type for the
     * given template state node.
     *
     * @param stateNode
     *            the template's state node
     * @param modelType
     *            the type of the template's model
     * @return a proxy object
     */
    public static <T extends TemplateModel> T createModelProxy(
            StateNode stateNode, Class<T> modelType) {
        return modelType.cast(Proxy.newProxyInstance(modelType.getClassLoader(),
                new Class[] { modelType },
                new TemplateModelProxyHandler(stateNode)));
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args)
            throws Throwable {
        Class<?> declaringClass = method.getDeclaringClass();
        if (declaringClass == Object.class) {
            return handleObjectMethod(method, args);
        }
        throw new UnsupportedOperationException(
                "Template Model does not yet support: " + method.getName());
    }

    private Object handleObjectMethod(Method method, Object[] args) {
        switch (method.getName()) {
        case "equals":
            assert args.length == 1;
            return handleEquals(args[0]);
        case "hashCode":
            assert args == null;
            return Integer.valueOf(stateNode.hashCode());
        case "toString":
            assert args == null;
            return "Template Model for a state node with id "
                    + stateNode.getId();
        default:
            throw new UnsupportedOperationException(
                    "Template Model does not support: " + method);
        }
    }

    private Boolean handleEquals(Object other) {
        if (other == null || !isTemplateModelProxy(other)) {
            return Boolean.FALSE;
        }
        StateNode otherNode = getStateNodeForProxy(other);
        return Boolean.valueOf(Objects.equals(otherNode, stateNode));
    }

    private static boolean isTemplateModelProxy(Object proxy) {
        return Proxy.isProxyClass(proxy.getClass())
                && Proxy.getInvocationHandler(
                        proxy) instanceof TemplateModelProxyHandler;
    }

    private static StateNode getStateNodeForProxy(Object proxy) {
        InvocationHandler handler = Proxy.getInvocationHandler(proxy);
        return ((TemplateModelProxyHandler) handler).stateNode;
    }
}
