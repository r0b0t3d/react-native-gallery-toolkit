import {
  useNavigation,
  useRoute,
  useTheme,
} from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Dimensions, Image, ScaledSize, View } from 'react-native';
import {
  GestureHandlerGestureEventNativeEvent,
  PanGestureHandlerEventExtra,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolate,
  interpolate,
  runOnUI,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  createAnimatedGestureHandler,
  GalleryItemType,
  runOnce,
  StandaloneGallery,
  useAnimatedReaction,
  useSharedValue,
} from '../';
import {
  useGalleryManager,
  GalleryManagerSharedValues,
} from './GalleryManager';
import { measureItem } from './GalleryList';

const AnimatedImage = Animated.createAnimatedComponent(Image);

const defaultTimingConfig = {
  duration: 250,
  easing: Easing.bezier(0.33, 0.01, 0, 1),
};

interface LightboxSwipeoutProps {
  children: ({
    onGesture,
    shouldHandleEvent,
  }: {
    onGesture: (
      evt: GestureHandlerGestureEventNativeEvent &
        PanGestureHandlerEventExtra,
    ) => void;
    shouldHandleEvent: () => boolean;
  }) => JSX.Element;
  source: any;
  timingConfig: Animated.WithTimingConfig;
  toValue: number;
  sharedValues: GalleryManagerSharedValues;
  windowDimensions: ScaledSize;
}

function LightboxSwipeout({
  children,
  source,
  onSwipeActive,
  onSwipeFailure,
  timingConfig = defaultTimingConfig,
  toValue = Dimensions.get('window').height,
  sharedValues,
  windowDimensions = Dimensions.get('window'),
  callback,
  renderImage,
  targetDimensions,
  renderBackdropComponent,
  renderOverlayComponent,
}: LightboxSwipeoutProps) {
  const imageSource =
    typeof source === 'string'
      ? {
          uri: source,
        }
      : source;

  const { x, y, width, height, opacity } = sharedValues;

  const animationProgress = useSharedValue(0);
  const childTranslateY = useSharedValue(0);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(1);
  const lightboxImageOpacity = useSharedValue(1);
  const childrenOpacity = useSharedValue(0);

  const targetWidth = useSharedValue(windowDimensions.width, true);
  const scaleFactor = targetDimensions.width / targetWidth.value;
  const targetHeight = useSharedValue(
    targetDimensions.height / scaleFactor,
  );

  const [renderChildren, setRenderChildren] = useState<boolean>(
    false,
  );

  const shouldHandleEvent = () => {
    'worklet';

    return childTranslateY.value === 0;
  };

  useAnimatedReaction(
    () => childTranslateY.value,
    (value) => {
      if (Math.abs(value) >= toValue + 100) {
        cancelAnimation(childTranslateY);
      }
    },
  );

  runOnce(
    runOnUI(() => {
      requestAnimationFrame(() => {
        opacity.value = 0;
      });
      animationProgress.value = withTiming(1, timingConfig, () => {
        'worklet';

        childrenOpacity.value = 1;
        setRenderChildren(true);
      });
    }),
  );

  const isVisibleImage = () => {
    'worklet';

    console.log(windowDimensions, {
      x: x.value,
      y: y.value,
    });

    return (
      windowDimensions.height >= y.value &&
      windowDimensions.width >= x.value &&
      x.value >= 0 &&
      y.value >= 0
    );
  };

  const handler = useCallback(
    createAnimatedGestureHandler<PanGestureHandlerGestureEvent, {}>({
      shouldHandleEvent: (evt) => {
        'worklet';

        return (
          evt.numberOfPointers === 1 &&
          Math.abs(evt.velocityX) < Math.abs(evt.velocityY) &&
          animationProgress.value === 1
        );
      },

      onActive: (evt) => {
        'worklet';

        childTranslateY.value = evt.translationY;

        if (onSwipeActive) {
          onSwipeActive(childTranslateY.value);
        }
      },

      onEnd: (evt) => {
        'worklet';

        const enoughVelocity = Math.abs(evt.velocityY) > 30;
        const rightDirection =
          (evt.translationY > 0 && evt.velocityY > 0) ||
          (evt.translationY < 0 && evt.velocityY < 0);

        if (enoughVelocity && rightDirection) {
          const elementVisible = isVisibleImage();

          if (elementVisible) {
            lightboxImageOpacity.value = 1;
            childrenOpacity.value = 0;
            animationProgress.value = withTiming(
              0,
              timingConfig,
              () => {
                'worklet';

                opacity.value = 1;
                callback();
              },
            );
          } else {
            const maybeInvert = (v: number) => {
              const invert = evt.velocityY < 0;
              return invert ? -v : v;
            };

            opacity.value = 1;

            childTranslateY.value = withSpring(
              maybeInvert(toValue * 2),
              {
                stiffness: 50,
                damping: 30,
                mass: 1,
                overshootClamping: true,
                velocity:
                  Math.abs(evt.velocityY) < 1200
                    ? maybeInvert(1200)
                    : evt.velocityY,
              },
              () => {
                'worklet';

                callback();
              },
            );
          }
        } else {
          childTranslateY.value = withSpring(0, {
            stiffness: 1000,
            damping: 500,
            mass: 2,
            restDisplacementThreshold: 10,
            restSpeedThreshold: 10,
            velocity: evt.velocityY,
          });

          if (onSwipeFailure) {
            onSwipeFailure();
          }
        }
      },
    }),
    [],
  );

  function onChildrenLayout() {
    if (lightboxImageOpacity.value === 0) {
      return;
    }

    requestAnimationFrame(() => {
      lightboxImageOpacity.value = 0;
    });
  }

  const childrenAnimateStyle = useAnimatedStyle(
    () => ({
      opacity: childrenOpacity.value,
      transform: [{ translateY: childTranslateY.value }],
    }),
    [],
  );

  const backdropStyles = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'black',
      opacity: animationProgress.value,
    };
  });

  const imageStyles = useAnimatedStyle(() => {
    const interpolateProgress = (range: [number, number]) =>
      interpolate(animationProgress.value, [0, 1], range);

    const targetX = 0;
    const targetY =
      (windowDimensions.height - targetHeight.value) / 2;

    const top =
      translateY.value +
      interpolateProgress([y.value, targetY + childTranslateY.value]);
    const left =
      translateX.value + interpolateProgress([x.value, targetX]);

    return {
      opacity: lightboxImageOpacity.value,
      position: 'absolute',
      top,
      left,
      width: interpolateProgress([width.value, targetWidth.value]),
      height: interpolateProgress([height.value, targetHeight.value]),
      transform: [
        {
          scale: scale.value,
        },
      ],
    };
  });

  return (
    <View style={{ flex: 1 }}>
      {renderBackdropComponent &&
        renderBackdropComponent({
          animatedStyles: backdropStyles,
          translateY: childTranslateY,
          animationProgress,
        })}

      <Animated.View style={StyleSheet.absoluteFillObject}>
        {typeof renderImage === 'function' ? (
          renderImage({
            source: imageSource,
            width: targetWidth.value,
            height: targetHeight.value,
            imageStyles,
          })
        ) : (
          <AnimatedImage
            source={imageSource}
            style={[
              {
                width: targetWidth.value,
                height: targetHeight.value,
              },
              imageStyles,
            ]}
          />
        )}
      </Animated.View>

      <Animated.View
        style={[StyleSheet.absoluteFill, childrenAnimateStyle]}
      >
        {renderChildren && (
          <Animated.View
            style={[StyleSheet.absoluteFill]}
            onLayout={onChildrenLayout}
          >
            {children({ onGesture: handler, shouldHandleEvent })}
          </Animated.View>
        )}
      </Animated.View>

      {renderOverlayComponent &&
        renderOverlayComponent({
          animatedStyles: backdropStyles,
          translateY: childTranslateY,
          animationProgress,
        })}
    </View>
  );
}

interface GalleryViewProps {
  initialIndex: number;
  items: GalleryItemType[];
  getItem?: (index: number, items: unknown) => GalleryItemType;
}

export function GalleryView({
  initialIndex,
  items,
  getItem,
  onHide,
  backdropColor,
  windowDimensions,
  onShouldHideControls,
  renderOverlayComponent,
}: GalleryViewProps) {
  const galleryManager = useGalleryManager();

  const { refsByIndexSV, sharedValues } = galleryManager;

  const [localIndex, setLocalIndex] = useState(initialIndex);

  const item = Array.isArray(items)
    ? items[localIndex]
    : getItem(localIndex, items);

  useAnimatedReaction(
    () => {
      return sharedValues.activeIndex.value;
    },
    (index) => {
      if (index > -1 && items[index]) {
        const items = refsByIndexSV.value;
        measureItem(items[index].ref, sharedValues);
      }
    },
  );

  const onIndexChange = useCallback((nextIndex: number) => {
    'worklet';

    setLocalIndex(nextIndex);
    sharedValues.activeIndex.value = nextIndex;
  }, []);

  const renderBackdropComponent = useCallback(
    ({ animatedStyles, translateY, animationProgress }) => {
      const customBackdropStyles = useAnimatedStyle(() => {
        return {
          opacity: interpolate(
            Math.abs(translateY.value),
            [0, 100],
            [1, 0],
            Extrapolate.CLAMP,
          ),
        };
      }, []);

      return (
        <Animated.View
          style={[StyleSheet.absoluteFill, customBackdropStyles]}
        >
          <Animated.View
            style={[
              animatedStyles,
              {
                backgroundColor: backdropColor ?? 'black',
              },
            ]}
          />
        </Animated.View>
      );
    },
    [],
  );

  const _renderOverlayComponent = useCallback(
    ({ animationProgress }) => {
      const animatedStyles = useAnimatedStyle(
        () => ({
          opacity: animationProgress.value,
        }),
        [],
      );

      return (
        <Animated.View style={[animatedStyles]}>
          {renderOverlayComponent!({ animationProgress })}
        </Animated.View>
      );
    },
    [],
  );

  function _onSwipeActive(translateY: number) {
    'worklet';

    if (Math.abs(translateY) > 8) {
      onShouldHideControls(true);
    }
  }

  function _onSwipeFailure() {
    'worklet';

    onShouldHideControls(false);
  }

  function callback() {
    'worklet';

    sharedValues.width.value = 0;
    sharedValues.height.value = 0;
    sharedValues.opacity.value = 1;
    sharedValues.activeIndex.value = -1;
    sharedValues.x.value = 0;
    sharedValues.y.value = 0;

    onHide();
  }

  return (
    <LightboxSwipeout
      targetDimensions={item}
      callback={callback}
      sharedValues={galleryManager.sharedValues}
      source={item.uri}
      onSwipeActive={_onSwipeActive}
      onSwipeFailure={_onSwipeFailure}
      renderBackdropComponent={renderBackdropComponent}
      renderOverlayComponent={_renderOverlayComponent}
      windowDimensions={windowDimensions}
    >
      {({ onGesture, shouldHandleEvent }) => (
        <StandaloneGallery
          items={items}
          onIndexChange={onIndexChange}
          shouldPagerHandleGestureEvent={shouldHandleEvent}
          onShouldHideControls={onShouldHideControls}
          height={windowDimensions.height}
          width={windowDimensions.width}
          initialIndex={initialIndex}
          onPagerEnabledGesture={onGesture}
        />
      )}
    </LightboxSwipeout>
  );
}