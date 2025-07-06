<script>
	import Button from "$lib/elements/Button.svelte";
	import DividerHorizontal from "$lib/elements/DividerHorizontal.svelte";
	import Menu from "$lib/elements/Menu.svelte";

    let {id, isActive, menuOffset} = $props();
</script>

<Menu isActive={isActive} menuOffset={menuOffset}>
    <Button 
        classes="menu-light icon-fill-red justify-content-left" 
        iconId="circle"
        label="Red"
        isDisabled
    />
    <Button 
        classes="menu-light icon-fill-orange justify-content-left" 
        iconId="circle"
        iconColor="orange"
        iconStrokeColor="orange"
        label="Orange"
        isDisabled
    />
    <Button 
        classes="menu-light icon-fill-yellow justify-content-left" 
        iconId="circle"
        iconColor="yellow"
        iconStrokeColor="yellow"
        label="Yellow"
        isDisabled
    />
    <Button 
        classes="menu-light icon-fill-green justify-content-left" 
        iconId="circle"
        iconColor="green"
        iconStrokeColor="green"
        label="Green"
        isDisabled
    />
    <Button 
        classes="menu-light icon-fill-aqua justify-content-left" 
        iconId="circle"
        iconColor="aqua"
        iconStrokeColor="aqua"
        label="Aqua"
        isDisabled
    />
    <Button 
        classes="menu-light icon-fill-blue justify-content-left" 
        iconId="circle"
        iconColor="blue"
        iconStrokeColor="blue"
        label="Blue"
        isDisabled
    />
    <Button 
        classes="menu-light icon-fill-purple justify-content-left" 
        iconId="circle"
        iconColor="purple"
        iconStrokeColor="purple"
        label="Purple"
        isDisabled
    />
    <Button 
        classes="menu-light icon-fill-pink justify-content-left" 
        iconId="circle"
        iconColor="pink"
        iconStrokeColor="pink"
        label="Pink"
        isDisabled
    />
</Menu>