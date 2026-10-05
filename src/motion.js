export const motionOf = target => target.isStage
    ? { costume: target.currentCostume }
    : {
        x: target.x,
        y: target.y,
        direction: target.direction,
        size: target.size,
        visible: target.visible,
        draggable: target.draggable,
        rotationStyle: target.rotationStyle,
        costume: target.currentCostume,
    };

export function applyMotion(target, motion) {
    if (!target.isStage) {
        target.setXY(motion.x, motion.y, true);
        target.setRotationStyle(motion.rotationStyle);
        target.setDirection(motion.direction);
        target.setSize(motion.size);
        target.setVisible(motion.visible);
        target.setDraggable(motion.draggable);
    }
    if (target.sprite.costumes.length) target.setCostume(motion.costume);
}

export const poseOf = target => target.isStage
    ? [target.currentCostume]
    : [target.x, target.y, target.direction, target.size, target.visible, target.currentCostume];

export function applyPose(target, pose) {
    if (target.isStage) return applyMotion(target, { costume: pose[0] });
    const [x, y, direction, size, visible, costume] = pose;
    return applyMotion(target, {
        x, y, direction, size, visible, costume,
        rotationStyle: target.rotationStyle,
        draggable: target.draggable,
    });
}
