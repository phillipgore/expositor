<script>
    import iconData from "$lib/data/icons.json";

    let {iconId, isActive, classes} = $props();

    const getIcon = (iconId) => {
        return iconData.find(icon => icon._id === iconId);
    }
</script>

<svg class="icon {isActive? 'active' : ''} {classes}" viewBox="{getIcon(iconId).viewBox}">
    <path d={getIcon(iconId).d}/>
</svg>

<style>
    svg.icon {
        height: 1.4rem;
        max-width: 1.6rem;
        margin: 0.0rem;
        pointer-events: none;

        &.menu-caret {
            width: 0.7rem;
            margin-left: 0.4rem;
            pointer-events: none;
        }

        &.icon-space {
            margin-right: 0.6rem;
        }
    }
</style>