<script>
	import Button from "$lib/elements/Button.svelte";
	import DividerHorizontal from "$lib/elements/DividerHorizontal.svelte";
	import Menu from "$lib/elements/Menu.svelte";

    let {id, isActive, menuOffset} = $props();
</script>

<Menu isActive={isActive} menuOffset={menuOffset}>
    <Button 
        classes="menu-light justify-content-left" 
        iconId="text-split"
        label="Split"
        shortcut="<span>&#8984;TS</span>"
        isDisabled
    />
    <Button 
        classes="menu-light justify-content-left" 
        iconId="text-join"
        label="Join"
        shortcut="<span>&#8984;TJ</span>"
        isDisabled
    />

    <DividerHorizontal/>

    <Button 
        classes="menu-light justify-content-left" 
        iconId="arrow-up"
        label="Move Up"
        shortcut="<span>&#8984;MU</span>"
        isDisabled
    />
    <Button 
        classes="menu-light justify-content-left" 
        iconId="arrow-down"
        label="Move Down"
        shortcut="<span>&#8984;MD</span>"
        isDisabled
    />
</Menu>