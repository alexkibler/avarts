<script lang="ts">
	import { formatDate } from '$lib/utils.js';
  import { userCookie } from "$lib/stores";
  import { env } from "$env/dynamic/public";
  import type { Exercise, UserData } from '$lib/types';

  export let data: Exercise;
  let user = ($userCookie as UserData)?.user;

  let url: string;
  if (env.PUBLIC_DB_URL) {
    url = env.PUBLIC_DB_URL;
  } else {
    url = "http://127.0.0.1:8090";
  }

  if (user && user.id != data.user) {
    if (typeof window !== 'undefined') window.location.href = "/";
  };
</script>


{#if user && user.id == data.user}
<div class="px-5 pt-5">
  <div class="flex flex-row justify-between border-b border-neutral-400 pb-5">
    <h1 class="text-3xl text-white font-semibold p-1">Edit Activity</h1>
    {#if data.name}
      <button type="submit" form="update" class="bg-orange-600 px-14 py-2 rounded-md font-semibold text-white hover:bg-orange-700">Save</button>
    {/if}
  </div>
  <div class="flex flex-col md:flex-row">
    <form id="update" action="?/update" method="POST" class="flex flex-row w-full lg:w-2/3" enctype="multipart/form-data">
      <div class="flex flex-col w-7/12 text-white">
        <p class="mt-3 font-semibold">Title</p>
        <input type="text" name="name" bind:value={data.name} class="bg-neutral-800 border border-neutral-500 rounded-md mt-2 p-1"/>
        <p class="mt-3 font-semibold">Description</p>
        <textarea name="description" value={data.description} class="bg-neutral-800 border border-neutral-500 rounded-md text-white w-full placeholder-slate-300 placeholder-opacity-50 placeholder:italic p-1 mt-2" rows="5" placeholder="Activity Notes"></textarea>
      </div>
      <div class="flex flex-col w-5/12 px-3 text-white">
        <p class="mt-3 font-semibold">Sport</p>
        <select name="sport" value={data.sport} class="bg-neutral-800 border border-neutral-500 rounded-md text-white w-full mt-2 p-1">
          <option value="cycling">Cycling</option>
          <option value="running">Running</option>
          <option value="swimming">Swimming</option>
        </select>
      </div>
    </form>
    <div class="flex flex-col w-11/12 lg:w-1/3">
      <div class="flex flex-col bg-neutral-800 mt-4">
        <div class="h-[250px] bg-neutral-900 flex items-center justify-center">
          {#if data.img}
            <img src="{url}/api/files/{data.collectionId}/{data.id}/{data.img}" alt="activity thumbnail" class="w-full h-full object-cover"/>
          {:else}
            <div class="text-neutral-500 flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p class="text-xs italic">No thumbnail available</p>
            </div>
          {/if}
        </div>
        <table class="w-full text-white">
          <tr>
            <td class="font-semibold px-5 p-1 pt-5">
              Date
            </td>
            <td class="text-sm pt-5">
              {formatDate(data.start_time)}
            </td>
          </tr>
          <tr>
            <td class="font-semibold px-5 p-1">
              Distance
            </td>
            <td>
              {data.tot_distance.toFixed(2)} km
            </td>
          </tr>
          <tr>
            <td class="font-semibold px-5 p-1">
              Time
            </td>
            <td>
              {new Date(data.elap_time * 1000).toISOString().substring(11, 19)}
            </td>
          </tr>
          <tr>
            <td class="font-semibold px-5 p-1 pb-5">
              Elevation Gain
            </td>
            <td class="pb-5">
              {data.tot_elevation * 1000} m
            </td>
          </tr>
        </table>
      </div>
    </div>
  </div>
</div>
{/if}
