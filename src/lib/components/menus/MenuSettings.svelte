<script>
	import Button from "$lib/elements/Button.svelte";
	import DividerHorizontal from "$lib/elements/DividerHorizontal.svelte";
	import Menu from "$lib/elements/Menu.svelte";

    let {id, isActive, menuOffset} = $props();
</script>

<Menu isActive={isActive} menuOffset={menuOffset} classes="menu-right">
    <Button 
        classes="menu-light justify-content-left" 
        iconId="account"
        label="Account"
        shortcut="<span>&#8984;SA</span>"  
    />
    <Button 
        classes="menu-light justify-content-left" 
        iconId="toolbar"
        label="Toolbar"
        shortcut="<span>&#8984;ST</span>"  
    />
    <Button 
        classes="menu-light justify-content-left" 
        iconId="help"
        label="Help"
        shortcut="<span>&#8984;SH</span>"  
    />

    <DividerHorizontal/>

    <Button 
        classes="menu-light justify-content-left" 
        iconId="power"
        label="Sign Out"
        labelIsLeft
    />
</Menu>