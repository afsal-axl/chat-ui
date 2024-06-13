<script lang="ts">
    export let label: string;
    export let onClick: () => void;
  </script>
  
  <style>
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 1.9rem;
      padding: 0 1rem;
      font-size: 1rem;
      color: white;
      background-color: #007bff;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }
  
    button:hover {
      background-color: #0056b3;
    }
  </style>
  
  <button on:click={onClick}>
    {#if label}
      {label}
    {/if}
  </button>
  