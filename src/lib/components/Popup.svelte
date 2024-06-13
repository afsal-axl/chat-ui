<!-- Popup.svelte -->
<script lang="ts">
    export let show = false;
    export let close: () => void;
  </script>
  
  <style>
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  
    .popup {
      background: white;
      padding: 2rem;
      border-radius: 0.5rem;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
  </style>
  
  {#if show}
    <div class="overlay" on:click={close}>
      <div class="popup" on:click|stopPropagation>
        <slot></slot>
        <button type = "button" on:click={close}>Close</button>
      </div>
    </div>
  {/if}
  