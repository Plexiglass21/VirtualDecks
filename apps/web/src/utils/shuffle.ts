export function shuffle<T>(items: T[]): T[] {
    //creo copia dell'array
    const shuffled = [...items]

    //il ciclo parte dall'ultima carta
    for (let i = shuffled.length - 1; i > 0; i--) {
        //sceglie un valore da 0 a i random 
        const randomIndex = Math.floor(Math.random() * (i + 1))
        
        //inverte la i-esima con l'indece randomizzato
        const temp = shuffled[i]
        shuffled[i] = shuffled[randomIndex]
        shuffled[randomIndex] = temp
    }

    return shuffled
}