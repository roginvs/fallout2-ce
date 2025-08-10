/**
 *
 * Displays a context menu at the specified target element.
 * @param {HTMLElement} targetElement
 * @param {{label: string, id: string}[]} items
 * @param {(item: string) => void} onItemClick
 */
export function showContextMenu(targetElement, items, onItemClick) {
    if (document.getElementById("contextMenu") !== null) {
        // TODO: Already exists
        return;
    }
    const menu = document.createElement("div");
    menu.id = "contextMenu";
    menu.className = "context-menu context-menu-hidden";
    document.body.appendChild(menu);
    items.forEach((item) => {
        const menuItem = document.createElement("div");
        menuItem.className = "context-menu-item";
        menuItem.textContent = item.label;
        menuItem.addEventListener("click", () => {
            onItemClick(item.id);
            menu.remove();
        });
        menu.appendChild(menuItem);
    });
    menu.classList.remove("context-menu-hidden");

    const { top, left, height } = targetElement.getBoundingClientRect();
    menu.style.top = `${top + height}px`;
    menu.style.left = `${left}px`;

    const onClick = (/** @type {MouseEvent} */ e) => {
        document.removeEventListener("click", onClick);
        menu.remove();
    };
    document.addEventListener("click", onClick, { once: true });
}
